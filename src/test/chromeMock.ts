import { vi } from "vitest";

type StorageData = Record<string, unknown>;
type StorageAreaOperation = "get" | "set" | "remove";
type RuntimeLastError = { message?: string };
export type ChromeRuntimeMessageListener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | undefined;

const nextErrors: Partial<Record<StorageAreaOperation, RuntimeLastError>> = {};

export function setChromeStorageError(operation: StorageAreaOperation, message: string): void {
  nextErrors[operation] = { message };
}

export function setChromeStorageLastError(operation: StorageAreaOperation, error: RuntimeLastError = {}): void {
  nextErrors[operation] = error;
}

export function installChromeRuntimeMock(): { listeners: ChromeRuntimeMessageListener[] } {
  const listeners: ChromeRuntimeMessageListener[] = [];
  const currentChrome = globalThis.chrome as Partial<typeof chrome> | undefined;
  const runtime = (currentChrome?.runtime ?? {}) as {
    lastError: RuntimeLastError | undefined;
    onMessage?: unknown;
  };

  runtime.onMessage = {
    addListener: vi.fn((listener: ChromeRuntimeMessageListener) => {
      listeners.push(listener);
    })
  };

  globalThis.chrome = {
    ...currentChrome,
    runtime
  } as unknown as typeof chrome;

  return { listeners };
}

export function installChromeStorageMock(initial: StorageData = {}): StorageData {
  const data: StorageData = { ...initial };
  const currentChrome = globalThis.chrome as Partial<typeof chrome> | undefined;
  const runtime = (currentChrome?.runtime ?? {}) as {
    lastError: RuntimeLastError | undefined;
    onMessage?: unknown;
  };
  runtime.lastError = undefined;
  if (!("onMessage" in runtime)) {
    runtime.onMessage = {
      addListener: vi.fn()
    };
  }

  function runWithLastError(operation: StorageAreaOperation, callback: () => void): void {
    const error = nextErrors[operation];
    delete nextErrors[operation];
    runtime.lastError = error;
    callback();
    runtime.lastError = undefined;
  }

  globalThis.chrome = {
    ...currentChrome,
    runtime,
    storage: {
      local: {
        get: vi.fn((keys: string[] | string | StorageData | null, callback: (items: StorageData) => void) => {
          if (keys === null) {
            runWithLastError("get", () => callback({ ...data }));
            return;
          }
          if (typeof keys === "object" && !Array.isArray(keys)) {
            const result: StorageData = {};
            for (const [key, defaultValue] of Object.entries(keys)) {
              result[key] = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
            }
            runWithLastError("get", () => callback(result));
            return;
          }
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result: StorageData = {};
          for (const key of keyList) result[key] = data[key];
          runWithLastError("get", () => callback(result));
        }),
        set: vi.fn((items: StorageData, callback?: () => void) => {
          Object.assign(data, items);
          if (callback) runWithLastError("set", callback);
        }),
        remove: vi.fn((keys: string[] | string, callback?: () => void) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) delete data[key];
          if (callback) runWithLastError("remove", callback);
        })
      }
    }
  } as unknown as typeof chrome;

  return data;
}
