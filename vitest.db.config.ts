import { defineConfig } from "vitest/config";

// DB integration tests: run against a LOCAL Postgres with Supabase roles (see README). Files run serially (shared DB).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
