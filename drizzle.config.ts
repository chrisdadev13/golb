import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/bun/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
