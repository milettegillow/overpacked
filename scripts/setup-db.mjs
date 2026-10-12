// Runs db/schema.sql, then every db/migrations/*.sql in name order, against
// DATABASE_URL. Every file is safe to re-run. Usage: npm run db:setup
import { readdir, readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = neon(url);
const dbDir = new URL("../db/", import.meta.url);

// The HTTP driver runs one statement per query. Split on semicolons that end a
// line, except inside dollar-quoted blocks ($$ ... $$, $sql$ ... $sql$).
function splitStatements(text) {
  const statements = [];
  let current = "";
  let openTag = null;
  for (const line of text.split("\n")) {
    if (!openTag && /^\s*--/.test(line)) continue;
    current += line + "\n";
    for (const [tag] of line.matchAll(/\$[a-z_]*\$/gi)) {
      if (openTag === null) openTag = tag;
      else if (tag === openTag) openTag = null;
    }
    if (openTag === null && /;\s*$/.test(line)) {
      statements.push(current.trim().replace(/;$/, ""));
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter(Boolean);
}

const migrations = (await readdir(new URL("migrations/", dbDir)))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const files = ["schema.sql", ...migrations.map((f) => `migrations/${f}`)];

for (const file of files) {
  const statements = splitStatements(await readFile(new URL(file, dbDir), "utf8"));
  for (const statement of statements) {
    await sql.query(statement);
  }
  console.log(`${file}: applied ${statements.length} statements.`);
}
