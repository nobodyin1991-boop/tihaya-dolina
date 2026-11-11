// Static check: every named import in src/ resolves to an export of the target module. `node tools/check-imports.mjs`
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})('src');

const exportsOf = new Map();
function getExports(file, seen = new Set()) {
  if (exportsOf.has(file)) return exportsOf.get(file);
  const names = new Set();
  exportsOf.set(file, names);
  if (!existsSync(file) || seen.has(file)) return names;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  for (const m of src.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const n of getExports(resolve(dirname(file), m[1]), seen)) names.add(n);
  }
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

let bad = 0;
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[2]);
    if (!existsSync(target)) { console.log(`${file}: missing module ${m[2]}`); bad++; continue; }
    const ex = getExports(target);
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !ex.has(name)) { console.log(`${file}: '${name}' is not exported by ${m[2]}`); bad++; }
    }
  }
}
console.log(bad ? `${bad} problem(s)` : 'all imports resolve');
process.exit(bad ? 1 : 0);
