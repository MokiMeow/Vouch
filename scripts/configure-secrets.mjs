import {
  constants,
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { parse } from "dotenv";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--file"))
  throw new Error("Use setup:secrets with optional --file .env.production");
const file = args[1] ?? ".env";
if (![".env", ".env.production"].includes(file))
  throw new Error("Choose .env or .env.production in the repository root");
if (
  !existsSync(file) ||
  !lstatSync(file).isFile() ||
  lstatSync(file).isSymbolicLink()
)
  throw new Error(
    "Copy the matching environment example privately before configuring secrets",
  );
const lock = `${file}.vouch-lock`;
const descriptor = openSync(
  lock,
  constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
  0o600,
);
const temporary = `${file}.${randomUUID()}.tmp`;
try {
  const text = readFileSync(file, "utf8");
  const settings = parse(text);
  const names = ["VOUCH_EVIDENCE_SIGNING_KEY", "VOUCH_ARTIFACT_KEY"];
  let updated = text;
  let generated = 0;
  for (const name of names) {
    if (settings[name]) continue;
    const value = randomBytes(32).toString("base64");
    const line = new RegExp(`^(?:export\\s+)?${name}\\s*=.*$`, "gm");
    if (line.test(updated)) updated = updated.replace(line, `${name}=${value}`);
    else updated += `${updated.endsWith("\n") ? "" : "\n"}${name}=${value}\n`;
    generated++;
  }
  if (generated) {
    writeFileSync(temporary, updated, { mode: 0o600, flag: "wx" });
    renameSync(temporary, file);
  }
  chmodSync(file, 0o600);
  console.log(
    `Configured ${generated} missing server keys. Existing keys were preserved and no values were printed.`,
  );
} finally {
  closeSync(descriptor);
  if (existsSync(temporary)) unlinkSync(temporary);
  unlinkSync(lock);
}
