#!/usr/bin/env node
// Build the companion guide into dist/guide/ (issue #84). Runs after `vite build`.
//
// Authored pages: guide/*.md (front matter: title, description, order).
// Generated pages: guide/articles/*, from the committed public/graph.json and
// public/headings.json. No WordPress or BigQuery access: the index is exactly
// as fresh as the snapshot the Explorer itself shows, and every refresh of
// that snapshot on main redeploys both.
//
// A snapshot that fails validation stops the build with every problem listed,
// so the Pages deploy is skipped and the last good guide stays online.
//
// Usage: node scripts/build-guide.mjs [--out dist/guide]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildArticleIndex,
  escapeHtml,
  pageShell,
  parseFrontMatter,
  renderMarkdown,
  renderSiteIndex,
  validateSnapshot,
} from './guide/lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outArg = process.argv.indexOf('--out');
const out = resolve(root, outArg > 0 ? process.argv[outArg + 1] : 'dist/guide');
const base = (process.env.GUIDE_BASE_URL ?? 'https://webmemo-code.github.io/travel-graph-explorer/guide/').replace(/\/?$/, '/');

const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const graph = readJson('public/graph.json');
const headings = readJson('public/headings.json');

const errors = validateSnapshot(graph, headings);
if (errors.length) {
  console.error(`build-guide: the snapshot failed ${errors.length} check(s); nothing written.`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

// When the snapshot was last committed. Pages checks out full history for this.
let asOf = null;
try {
  asOf = execFileSync('git', ['log', '-1', '--format=%cs', '--', 'public/graph.json'], { cwd: root, encoding: 'utf8' }).trim() || null;
} catch {
  asOf = null;
}

const pages = readdirSync(join(root, 'guide'))
  .filter((f) => f.endsWith('.md'))
  .map((f) => {
    const { meta, body } = parseFrontMatter(readFileSync(join(root, 'guide', f), 'utf8'));
    if (!meta.title) throw new Error(`guide/${f}: front matter needs a title`);
    return { file: f, href: f.replace(/\.md$/, '.html'), title: meta.title, description: meta.description ?? '', order: Number(meta.order ?? 99), body };
  })
  .sort((a, b) => a.order - b.order || a.file.localeCompare(b.file));

const index = buildArticleIndex(graph, headings);
const nav = [
  ...pages.map((p) => ({ href: p.href, title: p.title })),
  { href: 'articles/index.html', title: 'Article index' },
];

const written = [];
const write = (rel, html) => {
  const path = join(out, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
  written.push(rel);
};

for (const p of pages) {
  write(p.href, pageShell({
    title: p.title,
    description: p.description,
    body: renderMarkdown(p.body),
    nav,
    current: p.href,
    canonical: base + p.href,
    asOf,
  }));
}

const overview = index
  .map((s) => `<li><a href="${s.key}.html">${escapeHtml(s.name)}</a> (${s.language.toUpperCase()}): ${s.articles} articles in ${s.groups.length} groups, ${s.paired} with a counterpart on the other blog.</li>`)
  .join('\n');
write('articles/index.html', pageShell({
  title: 'Article index',
  description: 'Every published article on Travelmemo and Reisememo, grouped by blog and country, with its ontology entities and its counterpart on the other blog.',
  body: `<p>Generated from the same snapshot the Explorer shows. Each article lists the ontology entities it is tagged with (authors left out) and, where the two blogs carry the same story, a link to the other language version. A counterpart is an explicit translation link set on the post, never a guess from shared entities.</p>
<ul>${overview}</ul>
<p>How this page stays current is explained in <a href="../updates.html">How the guide updates</a>.</p>`,
  nav,
  current: 'articles/index.html',
  canonical: `${base}articles/index.html`,
  asOf,
  depth: 1,
}));
for (const s of index) {
  write(`articles/${s.key}.html`, pageShell({
    title: `${s.name} articles`,
    description: `All ${s.articles} ${s.name} articles by country, with their ontology entities and counterparts.`,
    body: `<p><a href="index.html">All blogs</a> · ${s.articles} articles on <a href="${escapeHtml(s.url)}">${escapeHtml(new URL(s.url).host)}</a>, ${s.paired} with a counterpart. An article about several countries is listed under each.</p>\n${renderSiteIndex(s)}`,
    nav,
    current: 'articles/index.html',
    canonical: `${base}articles/${s.key}.html`,
    asOf,
    depth: 1,
  }));
}

copyFileSync(join(root, 'guide', 'guide.css'), join(out, 'guide.css'));
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${written.map((rel) => `<url><loc>${escapeHtml(base + rel)}</loc>${asOf ? `<lastmod>${asOf}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
writeFileSync(join(out, 'sitemap.xml'), sitemap);
console.log(`build-guide: ${written.length} pages in ${out} (article data as of ${asOf ?? 'unknown'})`);
