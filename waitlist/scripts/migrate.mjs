// Creates the waitlist table in the Neon database named by DATABASE_URL.
// Usage: npm run db:migrate   (reads .env.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local first.");
  process.exit(1);
}

const sql = neon(url);
const schema = readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8");
const statements = schema
  .split(";")
  .map((s) => s.replace(/--.*$/gm, "").trim())
  .filter(Boolean);

for (const statement of statements) await sql.query(statement);
const [{ count }] = await sql.query("SELECT COUNT(*)::int AS count FROM waitlist");
console.log(`waitlist table ready (${count} signups).`);
