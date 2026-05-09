import { vi } from "vitest";

type StorageData = Record<string, unknown>;

export function installChromeStorageMock(initial: StorageData = {}): StorageData {
  const data: StorageData = { ...initial };

  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn((keys: string[] | string | null, callback: (items: StorageData) => void) => {
          if (keys === null) {
            callback({ ...data });
            return;
          }
          const keyList = Array.isArray(keys) ? keys : [keys];
          const result: StorageData = {};
          for (const key of keyList) result[key] = data[key];
          callback(result);
        }),
        set: vi.fn((items: StorageData, callback?: () => void) => {
          Object.assign(data, items);
          callback?.();
        }),
        remove: vi.fn((keys: string[] | string, callback?: () => void) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const key of keyList) delete data[key];
          callback?.();
        })
      }
    }
  } as unknown as typeof chrome;

  return data;
}
