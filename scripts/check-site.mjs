import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
function dependency(from, reference) {
  if (/^(?:https?:|data:|#)/.test(reference)) return;
  const resolved = path.resolve(path.dirname(from), reference.split(/[?#]/)[0] || '.');
  assert(resolved === path.resolve(root) || resolved.startsWith(path.resolve(root) + path.sep), `Reference leaves the project: ${reference}`);
  const target = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() ? path.join(resolved, 'index.html') : resolved;
  assert(fs.existsSync(target), `Missing dependency in ${path.basename(from)}: ${reference}`);
}
const scripts = fs.readdirSync(root).filter(name => name.endsWith('.js')).map(name => path.join(root, name));
scripts.push(...fs.readdirSync(path.join(root, 'scripts')).filter(name => name.endsWith('.mjs')).map(name => path.join(root, 'scripts', name)));
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/import\s+(?:[^;'"\n]+?\s+from\s+)?['"](\.[^'"]+)['"]/g)) dependency(file, match[1]);
}
for (const name of ['index.html', 'library.html']) {
  const filename = path.join(root, name), text = fs.readFileSync(filename, 'utf8');
  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) dependency(filename, match[1]);
}
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
assert(!css.includes('fonts.googleapis.com'), 'The published site should use its local font.');
for (const match of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) dependency(path.join(root, 'styles.css'), match[1]);
assert(fs.existsSync(path.join(root, '.nojekyll')), 'GitHub Pages needs .nojekyll for the static deployment.');
console.log(`Checked ${scripts.length} scripts, both pages, their local dependencies and the local font.`);
