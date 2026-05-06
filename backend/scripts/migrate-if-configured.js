import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping Prisma migrations.");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
