import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    typecheck: {
      tsconfig: "./tsconfig.test.json"
    }
  }
});
