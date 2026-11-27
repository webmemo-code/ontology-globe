import { describe, expect, it } from 'vitest';
import { buildArticleIndex, parseFrontMatter, renderMarkdown, validateSnapshot } from './lib.mjs';

const snapshot = () => ({
  schema: 'ontology-cube/graph@1',
  sites: [
    { key: 'travelmemo', name: 'Travelmemo', language: 'en', url: 'https://travelmemo.com', posts: 2 },
    { key: 'reisememo', name: 'Reisememo', language: 'de', url: 'https://reisememo.ch', posts: 1 },
  ],
  nodes: [
    { key: 'places/europe', type: 'Place', label: { en: 'Europe', de: 'Europa' } },
    { key: 'places/switzerland', type: 'Country', label: { en: 'Switzerland', de: 'Schweiz' } },
    { key: 'places/italy', type: 'Country', label: { en: 'Italy', de: 'Italien' } },
    { key: 'places/zermatt', type: 'City', label: { en: 'Zermatt', de: 'Zermatt' } },
    { key: 'places/lake-lugano', type: 'BodyOfWater', label: { en: 'Lake Lugano', de: 'Luganersee' } },
    { key: 'topics/hiking', type: 'DefinedTerm', label: { en: 'Hiking', de: 'Wandern' } },
    { key: 'people/walter-schaerer', type: 'Person', label: { en: 'Walter Schärer' } },
  ],
  edges: [
    { from: 'places/switzerland', to: 'places/europe', rel: 'parent' },
    { from: 'places/zermatt', to: 'places/switzerland', rel: 'parent' },
    { from: 'places/lake-lugano', to: 'places/switzerland', rel: 'parent' },
    { from: 'places/lake-lugano', to: 'places/italy', rel: 'parent' },
  ],
  posts: [
    { site: 'travelmemo', id: 1, url: 'https://travelmemo.com/zermatt-hike', entities: ['people/walter-schaerer', 'places/zermatt', 'topics/hiking'], pair: 'reisememo:9' },
    { site: 'travelmemo', id: 2, url: 'https://travelmemo.com/lake-lugano', entities: ['places/lake-lugano'] },
    { site: 'reisememo', id: 9, url: 'https://reisememo.ch/zermatt-wanderung', entities: ['topics/hiking'] },
  ],
});
const headings = () => ({
  schema: 'ontology-cube/headings@1',
  posts: {
    'travelmemo:1': { title: 'Hiking in Zermatt' },
    'travelmemo:2': { title: 'Lake Lugano' },
    'reisememo:9': { title: 'Wandern in Zermatt' },
  },
});

describe('validateSnapshot', () => {
  it('accepts a consistent snapshot', () => {
    expect(validateSnapshot(snapshot(), headings())).toEqual([]);
  });

  it('lists every problem at once', () => {
    const g = snapshot();
    g.posts[0].pair = 'reisememo:404';
    g.posts[1].url = 'https://reisememo.ch/wrong-blog';
    g.posts[2].entities.push('topics/missing');
    const h = headings();
    delete h.posts['travelmemo:2'];
    const errors = validateSnapshot(g, h);
    expect(errors).toHaveLength(4);
    expect(errors.join('\n')).toMatch(/reisememo:404/);
    expect(errors.join('\n')).toMatch(/not on https:\/\/travelmemo.com/);
    expect(errors.join('\n')).toMatch(/unknown entity topics\/missing/);
    expect(errors.join('\n')).toMatch(/no title/);
  });

  it('refuses a blog with no posts (an incomplete export)', () => {
    const g = snapshot();
    g.posts = g.posts.filter((p) => p.site !== 'reisememo');
    g.posts[0].pair = undefined;
    expect(validateSnapshot(g, headings()).join('\n')).toMatch(/reisememo: no posts/);
  });

  it('refuses a counterpart on the same blog', () => {
    const g = snapshot();
    g.posts[0].pair = 'travelmemo:2';
    expect(validateSnapshot(g, headings()).join('\n')).toMatch(/same blog/);
  });
});

describe('buildArticleIndex', () => {
  const [tm, rm] = buildArticleIndex(snapshot(), headings());

  it('groups by country through the place hierarchy', () => {
    expect(tm.groups.map((g) => g.label)).toEqual(['Italy', 'Switzerland']);
    // A lake on the border is listed under both countries.
    expect(tm.groups.find((g) => g.label === 'Italy').articles.map((a) => a.title)).toEqual(['Lake Lugano']);
    expect(tm.groups.find((g) => g.label === 'Switzerland').articles.map((a) => a.title)).toEqual(['Hiking in Zermatt', 'Lake Lugano']);
  });

  it('puts articles without a country last, labelled in the blog language', () => {
    expect(rm.groups.map((g) => g.label)).toEqual(['Ohne Land']);
  });

  it('labels entities in the blog language and leaves authors out', () => {
    const zermatt = tm.groups.find((g) => g.label === 'Switzerland').articles[0];
    expect(zermatt.entities.map((e) => e.label)).toEqual(['Hiking', 'Zermatt']);
    expect(rm.groups[0].articles[0].entities.map((e) => e.label)).toEqual(['Wandern']);
  });

  it('links the explicit counterpart only', () => {
    const zermatt = tm.groups.find((g) => g.label === 'Switzerland').articles[0];
    expect(zermatt.counterpart).toEqual({ key: 'reisememo:9', title: 'Wandern in Zermatt', url: 'https://reisememo.ch/zermatt-wanderung', site: 'Reisememo' });
    // The German post carries no link of its own, and sharing an entity is not one.
    expect(rm.groups[0].articles[0].counterpart).toBeNull();
    expect(tm.paired).toBe(1);
  });
});

describe('markdown', () => {
  it('reads front matter', () => {
    expect(parseFrontMatter('---\ntitle: Hello\norder: 2\n---\nBody')).toEqual({ meta: { title: 'Hello', order: '2' }, body: 'Body' });
  });

  it('rewrites links between guide pages and anchors headings', () => {
    const html = renderMarkdown('## Places and paths\n\nSee [OKF](okf.md#the-directory-tree) and [llms](https://llmstxt.org/x.md).');
    expect(html).toContain('<h2 id="places-and-paths">');
    expect(html).toContain('href="okf.html#the-directory-tree"');
    expect(html).toContain('href="https://llmstxt.org/x.md"');
  });
});
