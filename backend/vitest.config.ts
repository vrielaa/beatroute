import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const resolveSourcePath = (directory: string): string =>
  fileURLToPath(new URL(`./src/${directory}`, import.meta.url));

const config = defineConfig({
  resolve: {
    alias: {
      "@domain": resolveSourcePath("domain"),
      "@integrations": resolveSourcePath("integrations"),
      "@http": resolveSourcePath("http"),
    },
  },
});

export default config;
