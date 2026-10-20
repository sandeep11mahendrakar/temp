'use strict';
const path = require('node:path');
const fs = require('node:fs');

// Minimal .env reader. Deliberately dependency-free: dotenv is installed only
// under vision/node_modules and is not resolvable from the repo root, so
// require('dotenv') threw MODULE_NOT_FOUND and the silent catch left the CLI
// reading process.env only (false BLOCKED when the values live in vision/.env).
// Values are parsed but never printed; the CLI reports presence only.
function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Loads <cwd>/vision/.env into the given env object. Existing keys win, so a
// real process environment is never overwritten by the file.
function loadEnv(cwd = process.cwd(), env = process.env) {
  const envPath = path.join(cwd, 'vision', '.env');
  if (!fs.existsSync(envPath)) return { loaded: false, source: envPath, keys: 0 };
  let parsed;
  try {
    parsed = parseEnv(fs.readFileSync(envPath, 'utf8'));
  } catch (_) {
    return { loaded: false, source: envPath, keys: 0 };
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) env[key] = value;
  }
  return { loaded: true, source: envPath, keys: Object.keys(parsed).length };
}

// Factory stays env-only: it never reads files and never echoes values.
function checkPreflight(env = process.env) {
  const keys = ['SEED_USERNAME', 'SEED_PASSWORD'];
  const result = {};
  for (const key of keys) {
    result[key] = (env[key] && String(env[key]).trim() !== '') ? 'Y' : 'N';
  }
  return result;
}

function main() {
  loadEnv(process.cwd(), process.env);
  const result = checkPreflight(process.env);
  for (const key of Object.keys(result)) {
    console.log(key + '=' + result[key]);
  }
  const allYes = Object.values(result).every(v => v === 'Y');
  process.exitCode = allYes ? 0 : 1;
}

if (require.main === module) main();
module.exports = { checkPreflight, loadEnv, parseEnv };
