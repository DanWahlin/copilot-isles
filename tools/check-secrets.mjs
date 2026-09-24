// Fails if anything secret-looking ends up in dist/ (PLAN §6a, §7a: keys are build-time only).
// Locally, it also checks that no *value* of a KEY/SECRET/TOKEN variable from ~/.env appears.
// It never prints secret values, only variable names and file paths.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(dist)) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const TEXT = /\.(js|mjs|css|html|json|map|txt|webmanifest)$/;
const files = [];
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.test(n)) files.push(p);
  }
};
walk(dist);

const patterns = [
  { name: 'Azure/OpenAI env var name', re: /\b(AZURE_[A-Z_]*KEY|AZURE_OPENAI_API_KEY|AI_IMAGE_API_KEY)\b/ },
  { name: 'Ocp-Apim-Subscription-Key header', re: /Ocp-Apim-Subscription-Key/i },
  { name: 'Bearer/api-key literal', re: /["'](?:api-key|x-api-key)["']\s*[:,]\s*["'][A-Za-z0-9+/_-]{20,}/i },
];

const secretValues = [];
const envPath = join(homedir(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || !/KEY|SECRET|TOKEN|PASSWORD/i.test(m[1])) continue;
    const v = m[2].replace(/^['"]|['"]$/g, '');
    if (v.length >= 16) secretValues.push({ name: m[1], value: v });
  }
}

let hits = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const p of patterns) {
    if (p.re.test(text)) {
      hits++;
      console.error(`secret-like pattern (${p.name}) in ${relative(root, f)}`);
    }
  }
  for (const s of secretValues) {
    if (text.includes(s.value)) {
      hits++;
      console.error(`value of ${s.name} found in ${relative(root, f)}`);
    }
  }
}
console.log(`scanned ${files.length} files, ${secretValues.length} local secret values checked`);
if (hits) process.exit(1);
console.log('no secrets found');
