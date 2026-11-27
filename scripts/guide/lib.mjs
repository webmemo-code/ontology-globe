// Pure helpers for the companion guide (issue #84): front matter, the article
// index built from the committed graph snapshot, and the HTML page shell.
// No file or network access here, so the whole module is unit-testable;
// scripts/build-guide.mjs does the reading and writing.

import { marked } from 'marked';

/** Split `---\nkey: value\n---\nbody` into { meta, body }. Values are plain strings. */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^"(.*)"$/, '$1');
  }
  return { meta, body: text.slice(m[0].length) };
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function slugify(s) {
  return String(s)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const postKey = (p) => `${p.site}:${p.id}`;

/**
 * The countries a node sits in, by walking `parent` edges upwards.
 * A node can have several parents (a lake on a border), so this returns a set.
 */
function countriesOf(key, nodes, parents, seen = new Set()) {
  if (seen.has(key)) return new Set();
  seen.add(key);
  const node = nodes.get(key);
  if (!node) return new Set();
  if (node.type === 'Country') return new Set([key]);
  const out = new Set();
  for (const parent of parents.get(key) ?? []) {
    for (const c of countriesOf(parent, nodes, parents, seen)) out.add(c);
  }
  return out;
}

/**
 * Check the snapshot before anything is rendered. Every problem is collected
 * and returned, so one run names all of them. A non-empty list must stop the
 * build: a failed Pages build leaves the last good deploy online.
 */
export function validateSnapshot(graph, headings) {
  const errors = [];
  if (graph?.schema !== 'ontology-cube/graph@1') errors.push(`graph.json: unexpected schema ${graph?.schema}`);
  if (headings?.schema !== 'ontology-cube/headings@1') errors.push(`headings.json: unexpected schema ${headings?.schema}`);
  if (errors.length) return errors;

  const sites = new Map(graph.sites.map((s) => [s.key, s]));
  const nodes = new Set(graph.nodes.map((n) => n.key));
  const posts = new Set(graph.posts.map(postKey));
  for (const s of graph.sites) {
    const n = graph.posts.filter((p) => p.site === s.key).length;
    if (n === 0) errors.push(`${s.key}: no posts in the snapshot`);
    if (n !== s.posts) errors.push(`${s.key}: header says ${s.posts} posts, snapshot has ${n}`);
  }
  for (const p of graph.posts) {
    const k = postKey(p);
    const site = sites.get(p.site);
    if (!site) {
      errors.push(`${k}: unknown site`);
      continue;
    }
    let url;
    try {
      url = new URL(p.url);
    } catch {
      errors.push(`${k}: invalid URL ${p.url}`);
      continue;
    }
    if (url.origin !== new URL(site.url).origin) errors.push(`${k}: URL ${p.url} is not on ${site.url}`);
    if (!headings.posts[k]?.title) errors.push(`${k}: no title in headings.json`);
    for (const e of p.entities) if (!nodes.has(e)) errors.push(`${k}: unknown entity ${e}`);
    if (p.pair) {
      if (!posts.has(p.pair)) errors.push(`${k}: counterpart ${p.pair} is not in the snapshot`);
      else if (p.pair.split(':')[0] === p.site) errors.push(`${k}: counterpart ${p.pair} is on the same blog`);
    }
  }
  return errors;
}

/**
 * The article index: per blog, one group per country the article is about
 * (an article about two countries is listed under both), then a group for
 * articles that name no country. Sorted by label, then title, in the blog's
 * language.
 */
export function buildArticleIndex(graph, headings) {
  const nodes = new Map(graph.nodes.map((n) => [n.key, n]));
  const parents = new Map();
  for (const e of graph.edges) {
    if (e.rel !== 'parent') continue;
    if (!parents.has(e.from)) parents.set(e.from, []);
    parents.get(e.from).push(e.to);
  }
  const byKey = new Map(graph.posts.map((p) => [postKey(p), p]));
  const sites = new Map(graph.sites.map((s) => [s.key, s]));
  const title = (k) => headings.posts[k]?.title ?? k;
  const label = (key, lang) => {
    const n = nodes.get(key);
    return n?.label?.[lang] ?? n?.label?.en ?? key;
  };

  return graph.sites.map((site) => {
    const lang = site.language;
    const collator = new Intl.Collator(lang);
    const groups = new Map();
    const add = (gKey, gLabel, article) => {
      if (!groups.has(gKey)) groups.set(gKey, { key: gKey, label: gLabel, articles: [] });
      groups.get(gKey).articles.push(article);
    };
    for (const p of graph.posts.filter((x) => x.site === site.key)) {
      const k = postKey(p);
      const pair = p.pair ? byKey.get(p.pair) : null;
      const article = {
        key: k,
        title: title(k),
        url: p.url,
        entities: p.entities
          .filter((e) => !e.startsWith('people/'))
          .map((e) => ({ key: e, label: label(e, lang) }))
          .sort((a, b) => collator.compare(a.label, b.label)),
        counterpart: pair
          ? { key: p.pair, title: title(p.pair), url: pair.url, site: sites.get(pair.site)?.name ?? pair.site }
          : null,
      };
      const countries = new Set();
      for (const e of p.entities) for (const c of countriesOf(e, nodes, parents)) countries.add(c);
      if (countries.size === 0) add('_none', lang === 'de' ? 'Ohne Land' : 'No country', article);
      for (const c of countries) add(c, label(c, lang), article);
    }
    const sorted = [...groups.values()].sort((a, b) =>
      a.key === '_none' ? 1 : b.key === '_none' ? -1 : collator.compare(a.label, b.label),
    );
    for (const g of sorted) g.articles.sort((a, b) => collator.compare(a.title, b.title));
    return {
      key: site.key,
      name: site.name,
      language: lang,
      url: site.url,
      articles: graph.posts.filter((x) => x.site === site.key).length,
      paired: graph.posts.filter((x) => x.site === site.key && x.pair).length,
      groups: sorted,
    };
  });
}

/** One blog's index as HTML (the body of its page). */
export function renderSiteIndex(site) {
  const toc = site.groups
    .map((g) => `<a href="#${slugify(g.key)}">${escapeHtml(g.label)}</a> <span class="n">${g.articles.length}</span>`)
    .join(' · ');
  const sections = site.groups.map((g) => {
    const rows = g.articles.map((a) => {
      const entities = a.entities.map((e) => `<span class="tag">${escapeHtml(e.label)}</span>`).join(' ');
      const pair = a.counterpart
        ? `<div class="pair">↔ ${escapeHtml(a.counterpart.site)}: <a href="${escapeHtml(a.counterpart.url)}" hreflang="${site.language === 'en' ? 'de' : 'en'}">${escapeHtml(a.counterpart.title)}</a></div>`
        : '';
      return `<li><a href="${escapeHtml(a.url)}" hreflang="${site.language}">${escapeHtml(a.title)}</a><div class="tags">${entities}</div>${pair}</li>`;
    });
    return `<section id="${slugify(g.key)}"><h2>${escapeHtml(g.label)} <span class="n">${g.articles.length}</span></h2><ul class="articles">${rows.join('')}</ul></section>`;
  });
  return `<p class="toc">${toc}</p>\n${sections.join('\n')}`;
}

/** Render guide Markdown. Links to `other.md` become `other.html`. */
export function renderMarkdown(md) {
  const html = marked.parse(md, { async: false, gfm: true });
  return html
    .replace(/href="((?!https?:)[^"#]*?)\.md(#[^"]*)?"/g, 'href="$1.html$2"')
    .replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, inner) => {
      const id = slugify(inner.replace(/<[^>]+>/g, ''));
      return `<h${level} id="${id}">${inner}</h${level}>`;
    });
}

/**
 * The full HTML document. `nav` is [{ href, title }] relative to the guide
 * root; `depth` is how many folders below the root the page sits.
 */
export function pageShell({ title, description, body, nav, current, canonical, asOf, depth = 0 }) {
  const up = '../'.repeat(depth);
  const links = nav
    .map((n) => `<a href="${up}${n.href}"${n.href === current ? ' aria-current="page"' : ''}>${escapeHtml(n.title)}</a>`)
    .join('\n');
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: title,
    description,
    url: canonical,
    inLanguage: 'en',
    isPartOf: { '@type': 'WebSite', name: 'Travel Graph Explorer guide', url: new URL(`${up}index.html`, canonical).href },
    ...(asOf ? { dateModified: asOf } : {}),
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Travel Graph Explorer guide</title>
<meta name="description" content="${escapeHtml(description ?? '')}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<link rel="stylesheet" href="${up}guide.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
<header class="top"><a class="brand" href="${up}index.html">Travel Graph Explorer · Guide</a><a class="app" href="${up}../">Open the Explorer ↗</a></header>
<div class="layout">
<nav class="side" aria-label="Guide">
${links}
</nav>
<main>
<h1>${escapeHtml(title)}</h1>
${body}
<footer>${asOf ? `Article data as of ${escapeHtml(asOf)}. ` : ''}Source: <a href="https://github.com/webmemo-code/travel-graph-explorer/tree/main/guide">guide/</a> in travel-graph-explorer.</footer>
</main>
</div>
</body>
</html>
`;
}
