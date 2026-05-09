# DeepSeek 划词翻译

DeepSeek 划词翻译是一个 Chrome Extension。用户在普通网页中选中非中文文本后，插件会使用 DeepSeek Flash 翻译，并在选区附近显示紧凑的翻译气泡。

## 开发环境

项目需要 Node 20，版本约束记录在 `.nvmrc` 和 `.node-version` 中。

常用开发命令：

```bash
npm install
npm run check
npm test
npm run build
```

## 本地加载

1. 执行构建：

   ```bash
   npm run build
   ```

2. 打开 Chrome 的 `chrome://extensions`。
3. 开启右上角的 Developer mode。
4. 点击 Load unpacked。
5. 选择项目生成的 `dist` 目录。
6. 打开插件设置页，填写 DeepSeek API Key。

## 第一版能力

- 在普通网页中选中非中文文本后自动翻译。
- 选中中文文本时直接忽略。
- 翻译气泡优先显示在选区下方；下方空间不足时显示在上方。
- 气泡展示原文、播放按钮、音标和译文。
- 播放按钮使用浏览器 TTS 播放原文。
- 本地最多缓存 100 条翻译结果。
- 设置页支持填写 API Key、设置目标语言和清空缓存。

## 数据说明

- DeepSeek API Key 保存在 Chrome local storage 中。
- 翻译缓存仅用于单词和短语，不用于长句或段落。
