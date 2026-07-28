import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the "@/" alias (tsconfig paths) for unit tests.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: { environment: "node" },
});
