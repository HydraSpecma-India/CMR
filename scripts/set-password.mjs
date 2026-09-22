#!/usr/bin/env node
/**
 * Emergency password reset for any CMR user (e.g. when no administrator can sign in).
 * Runs on the server with the Supabase service key – there is no default or built-in password.
 *
 *   node scripts/set-password.mjs user@company.com "NewPassword"
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from the environment or .env / .env.local.
 */
import { randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 6) {
  console.error('Usage: node scripts/set-password.mjs <email> "<password, min 6 chars>"');
  process.exit(1);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;

const res = await fetch(`${url}/rest/v1/cmr_users?email=eq.${encodeURIComponent(email.trim().toLowerCase())}`, {
  method: "PATCH",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
  body: JSON.stringify({ password_hash: hash, active: true }),
});
const rows = res.ok ? await res.json() : [];
if (!res.ok) {
  console.error(`Update failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
if (!rows.length) {
  console.error(`No user with email ${email}. Add the user first (or sign in once with Microsoft).`);
  process.exit(1);
}
console.log(`Password updated for ${rows[0].email} (${rows[0].role}).`);
