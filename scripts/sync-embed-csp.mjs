#!/usr/bin/env node
/**
 * Propage frame-ancestors depuis embed-templates/frame-ancestors.json
 * vers tous les vercel.json du monorepo local.
 *
 * Usage: node scripts/sync-embed-csp.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { csp } = JSON.parse(
  readFileSync(join(root, 'embed-templates', 'frame-ancestors.json'), 'utf8'),
);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.next']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (name === 'vercel.json') out.push(path);
  }
  return out;
}

function patchVercelJson(path) {
  const raw = readFileSync(path, 'utf8');
  const json = JSON.parse(raw);
  if (!json.headers) json.headers = [];

  let block = json.headers.find((h) => h.source === '/(.*)');
  if (!block) {
    block = { source: '/(.*)', headers: [] };
    json.headers.unshift(block);
  }

  const idx = block.headers.findIndex((h) => h.key === 'Content-Security-Policy');
  const entry = { key: 'Content-Security-Policy', value: csp };
  if (idx >= 0) block.headers[idx] = entry;
  else block.headers.unshift(entry);

  // X-Frame-Options bloque frame-ancestors : retirer SAMEORIGIN/DENY si présent
  block.headers = block.headers.filter(
    (h) => h.key !== 'X-Frame-Options' || !/^(SAMEORIGIN|DENY)$/i.test(h.value),
  );

  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  return relative(join(root, '..', '..'), path);
}

const searchRoots = [
  join(root, '..', '..', 'Sites'),
  join(root, '..', '..', 'Portfolio'),
  join(root, 'embed-templates'),
];

const files = [...new Set(searchRoots.flatMap((dir) => walk(dir)))];
const updated = files.map(patchVercelJson);

console.log(`frame-ancestors synchronisé sur ${updated.length} fichier(s) :`);
for (const f of updated) console.log(`  · ${f}`);
