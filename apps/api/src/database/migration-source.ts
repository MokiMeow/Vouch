import { readdir, readFile } from "node:fs/promises";

const directory = new URL("./migrations/", import.meta.url);
const migrationName = /^\d{3}_[a-z_]+\.sql$/;
export async function readMigrationSql(name: string): Promise<string> {
  if (!migrationName.test(name)) throw new Error("Invalid migration filename");
  const sql = await readFile(new URL(name, directory), "utf8");
  return sql.replace(/\r\n?/g, "\n");
}
export async function listMigrationFiles(): Promise<string[]> {
  const files = (await readdir(directory))
    .filter((name) => migrationName.test(name))
    .sort();
  if (!files.length || files[0] !== "000_ledger.sql")
    throw new Error(
      "Versioned database migration files are missing from this build",
    );
  const versions = files.map((name) => Number(name.slice(0, 3)));
  if (versions.some((value, index) => value !== index))
    throw new Error(
      "Database migration versions must be unique and contiguous from zero",
    );
  return files;
}
