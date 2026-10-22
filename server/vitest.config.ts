import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env["TEST_DATABASE_URL"] ?? "postgresql://postgres@127.0.0.1:5545/sgs_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
    },
  },
});
