import { vi } from "vitest";

type StorageData = Record<string, unknown>;
type StorageAreaOperation = "get" | "set" | "remove";

const nextErrors: Partial<Record<StorageAreaOperation, string>> = {};

export function setChromeStorageError(operation: StorageAreaOperation, message: string): void {
  nextErrors[operation] = message;
}

export function installChromeStorageMock(initial: StorageData = {}): StorageData {
  const data: StorageData = { ...initial };
  const runtime = { lastError: undefined as { message?: string } | undefined };

  function runWithLastError(operation: StorageAreaOperation, callback: () => void): void {
    const message = nextErrors[operation];
    delete nextErrors[operation];
    runtime.lastError = message ? { message } : undefined;
    callback();
    runtime.lastError = undefined;
  }

  globalThis.chrome = {
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
            for (const [key, defaultValue] of Object.entries(keys)) result[key] = data[key] ?? defaultValue;
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
