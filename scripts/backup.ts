import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
async function main() {
  if (process.env.DATABASE_URL)
    throw new Error(
      "Use pg_dump with your managed PostgreSQL backup process. See docs/OPERATIONS.md.",
    );
  const { DatabaseSync, backup } = createRequire(import.meta.url)(
    "node:sqlite",
  );
  const directory = path.resolve("backups");
  await mkdir(directory, { recursive: true });
  const target = path.join(
    directory,
    `classflow-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
  );
  const db = new DatabaseSync(
    path.resolve(process.env.SQLITE_PATH || "data/classflow.sqlite"),
  );
  await backup(db, target);
  db.close();
  console.log(target);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
