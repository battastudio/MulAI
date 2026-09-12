#!/usr/bin/env node
// Zero-dep line-cap enforcer: every .js/.mjs/.cjs file must be <= 150 lines.
// Walks the repo, skips build/vendor dirs, exits 1 with a list of offenders.
'use strict';

const fs = require('fs');
const path = require('path');

const MAX = 150;
const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);
const SKIP_PATHS = new Set([path.join('.github', 'screenshots')]);
const EXTS = new Set(['.js', '.mjs', '.cjs']);

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || SKIP_PATHS.has(rel)) continue;
      walk(full, files);
    } else if (EXTS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const offenders = [];
for (const file of walk(ROOT, [])) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').length;
  if (lines > MAX) offenders.push({ file: path.relative(ROOT, file), lines });
}

if (offenders.length) {
  console.error(`✗ ${offenders.length} file(s) exceed ${MAX} lines:`);
  for (const o of offenders) console.error(`  ${o.file}: ${o.lines} lines`);
  process.exit(1);
}

console.log(`✓ every source file is ≤ ${MAX} lines`);
