# 气泡 UI 细节与 TTS 结束状态优化设计文档

## 目标

继续优化划词翻译气泡的视觉细节和播放状态，让气泡在不同字号下更自然，并让 TTS 播放结束后按钮自动恢复到播放状态。

本次优化只处理四个问题：

- 气泡边距需要随文字大小自然变化。
- 加载按钮中的三个点必须固定在一行。
- 气泡需要更合理的最小宽度，不能因为短词过窄。
- TTS 播放结束后，暂停按钮需要自动恢复成播放按钮。

## 已确认方案

采用“小幅 UI 修正 + TTS 结束事件回传”方案。

不重构整体气泡架构，不改变现有翻译、缓存、popup 配置流程。改动集中在气泡样式、内容脚本播放状态和后台 TTS 事件处理。

## 气泡尺寸和边距

当前气泡 padding 固定为 `10px 12px`。这在默认 `12px` 字号下可以接受，但用户调大字号后，气泡内部边距会显得偏紧。

新设计：

- 气泡通过 CSS 变量设置动态 padding。
- 默认 `12px` 字号时，边距接近当前观感。
- 字号增大时，横向和纵向 padding 随之增大。
- 推荐计算：
  - 垂直 padding：`max(10px, bubbleFontSize * 0.85px)`
  - 水平 padding：`max(12px, bubbleFontSize * 1px)`

实现上不需要在 CSS 中做复杂乘法，可以在 TypeScript 创建气泡时计算：

- `--dst-padding-y`
- `--dst-padding-x`

气泡 CSS 使用：

```css
padding: var(--dst-padding-y) var(--dst-padding-x);
```

## 气泡最小宽度

当前最小宽度为 `Math.min(150, position.maxWidth)`，短词时仍可能显得过窄。

新设计：

- 最小宽度随字号有一个更稳定的下限。
- 默认字号下建议最小宽度为 `180px`。
- 字号更大时，最小宽度略微增长。
- 但任何最小宽度都不能超过定位计算给出的 `position.maxWidth`。

推荐计算：

```ts
const preferredMinWidth = Math.max(180, fontSize * 12);
const minWidth = `${Math.min(preferredMinWidth, position.maxWidth)}px`;
```

这样短单词气泡不会无限缩小，小屏或边缘场景也不会强行溢出。

## 加载按钮三个点

当前加载按钮直接使用 `•••` 文本。按钮宽度较小、字体或浏览器渲染变化时，三个点可能换行成“两点在上，一点在下”。

新设计：

- 加载状态仍显示三个点。
- 三个点必须永远单行居中。
- 控制按钮内容使用固定布局：
  - `display: grid`
  - `place-items: center`
  - `white-space: nowrap`
  - `font-size` 保持稳定
  - `letter-spacing` 不使用负值

如果普通文本仍有换行风险，可以将三个点包进一个内部 `span.dst-loading-dots`：

```html
<span class="dst-loading-dots">•••</span>
```

并设置：

```css
.dst-loading-dots {
  display: inline-block;
  white-space: nowrap;
  line-height: 1;
}
```

## TTS 播放结束恢复状态

当前内容脚本在点击播放后把按钮切换到暂停状态，但后台 TTS 播放自然结束时，内容脚本没有收到结束信号，因此按钮不会自动恢复。

新设计：

1. 内容脚本点击播放。
2. 后台调用 `chrome.tts.speak(text, options)`。
3. `options` 中加入 `onEvent` 回调。
4. 当事件类型为以下任意一种时，后台通知内容脚本播放结束：
   - `end`
   - `interrupted`
   - `cancelled`
   - `error`
5. 内容脚本收到 `speaking-ended` 消息后：
   - 如果当前气泡仍处于播放状态，则切回播放按钮。
   - 如果气泡已关闭或已经切换到新选区，则忽略。

推荐新增消息：

```ts
export interface SpeakingEndedMessage {
  type: "speaking-ended";
}
```

后台发送消息时可以使用 `chrome.tabs.sendMessage(sender.tab.id, { type: "speaking-ended" })`。因此后台处理 `speak-source` 时需要读取 `sender.tab?.id`。

如果没有 `sender.tab.id`，后台仍然播放 TTS，但无法回传结束状态。内容脚本可以保持当前状态，用户仍可手动点击停止。

## 内容脚本状态处理

内容脚本新增 runtime message listener，接收后台发来的 `speaking-ended`。

处理规则：

- 只有消息类型是 `speaking-ended` 时处理。
- 如果 `isSpeaking` 为 `true`，设置为 `false` 并重新渲染当前翻译气泡。
- 如果当前没有翻译结果或气泡已经关闭，不做任何事。

为了避免重复安装监听器，现有 content script cleanup 机制需要清理新增的 runtime listener。

## 测试与验收标准

自动化测试应覆盖：

- 气泡根据字号设置 `--dst-padding-x` 和 `--dst-padding-y`。
- 气泡默认最小宽度至少为 `180px`，但不超过 `position.maxWidth`。
- 加载按钮包含单行 loading dots 元素，并设置不可换行类。
- 后台 `speak-source` 使用 TTS `onEvent`。
- TTS `end` 事件后，后台向内容脚本发送 `speaking-ended`。
- 内容脚本收到 `speaking-ended` 后，按钮从暂停恢复为播放。
- 内容脚本清理时移除 runtime message listener。

手动验收：

1. 默认 `12px` 字号下，短单词气泡不显得过窄。
2. 调大字号后，气泡内部上下左右边距同步变舒展。
3. 加载按钮里的三个点始终横向一行显示。
4. 点击播放后按钮变为暂停。
5. 语音自然播放结束后，按钮自动恢复为播放。
6. 点击暂停停止播放后，按钮也恢复为播放。

## 不包含范围

- 不重新设计气泡整体配色。
- 不改变 popup 配置项。
- 不实现真正的 TTS 暂停/恢复进度。
- 不加入播放进度条。
- 不改变 DeepSeek 翻译请求流程。

## 设计自查

- 四个用户问题均有对应设计。
- TTS 结束状态通过后台事件回传，不依赖固定计时器。
- 气泡最小宽度仍受可用最大宽度限制，不会破坏边缘定位。
- 加载点使用单行元素约束，避免换行。
