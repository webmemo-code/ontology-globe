#!/usr/bin/env node
// Check a graph snapshot with the guide's own validation, before it is
// committed (issue #84). The nightly refresh in entity-map
// (scripts/scheduled_viz_snapshot.ps1) runs this on its freshly exported files
// before copying them into public/; the Pages build runs the same
// validateSnapshot again on what was committed.
//
// Usage: node scripts/check-snapshot.mjs [graph.json] [headings.json]
// Defaults: public/graph.json and the headings.json beside the graph.
// Exit 1 with every problem listed; exit 0 with the per-blog post counts.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSnapshot } from './guide/lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const graphPath = resolve(process.argv[2] ?? join(root, 'public/graph.json'));
const headingsPath = resolve(process.argv[3] ?? join(dirname(graphPath), 'headings.json'));
const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
const headings = JSON.parse(readFileSync(headingsPath, 'utf8'));

const errors = validateSnapshot(graph, headings);
if (errors.length) {
  console.error(`check-snapshot: ${graphPath} failed ${errors.length} check(s).`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-snapshot: ok, ${graph.sites.map((s) => `${s.key} ${s.posts}`).join(', ')} posts`);
