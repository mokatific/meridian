import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    exclude: ["node_modules/**", "discord-listener/**", "logs/**"],
    environment: "node",
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "config.js",
        "decision-log.js",
        "lessons.js",
        "logger.js",
        "prompt.js",
        "signal-tracker.js",
        "signal-weights.js",
        "skipped-tracker.js",
        "utils/**/*.js",
        "tools/**/*.js",
      ],
      exclude: [
        "node_modules/**",
        "tests/**",
        "discord-listener/**",
        "scripts/**",
        "**/*.config.js",
      ],
    },
  },
});
