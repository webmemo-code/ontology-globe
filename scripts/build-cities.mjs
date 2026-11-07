// City coordinates for the live layer's reader dots, from a GeoNames dump
// (cities1000.txt, https://download.geonames.org/export/dump/, CC BY 4.0).
// GA4 sends a city only where "granular location" is allowed, which is
// Switzerland for now, so only those countries are kept.
// Output: public/cities.json, { "CH": { "<folded name>": [lat, lon] } },
// coordinates rounded to 0.01 degrees (about 1 km).
//
//   node scripts/build-cities.mjs path/to/cities1000.txt [CH ...]
import fs from 'node:fs';
import path from 'node:path';

const [file, ...countries] = process.argv.slice(2);
if (!file) throw new Error('usage: node scripts/build-cities.mjs cities1000.txt [CH ...]');
const keep = new Set(countries.length ? countries : ['CH']);
// Alternate names (Geneva, Lucerne, Genf) only for towns large enough to have
// them in GA4's English-ish naming; small places keep their own name.
const ALT_MIN_POP = 10000;

/** Lower case, no accents, single spaces: how GA4 and GeoNames spellings meet. */
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const best = {}; // country -> key -> { pop, at }
for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 15 || !keep.has(f[8])) continue;
  const pop = Number(f[14]) || 0;
  const at = [Math.round(Number(f[4]) * 100) / 100, Math.round(Number(f[5]) * 100) / 100];
  // Bilingual names (Biel/Bienne) count whole and per half.
  const names = [f[1], f[2], ...(pop >= ALT_MIN_POP ? f[3].split(',') : [])].flatMap((n) => [n, ...n.split('/')]);
  const map = (best[f[8]] ??= {});
  for (const n of names) {
    const k = fold(n);
    if (!/^[a-z][a-z .'/-]*$/.test(k)) continue; // Latin-script names only
    if (!map[k] || map[k].pop < pop) map[k] = { pop, at }; // a shared name goes to the larger place
  }
}
const out = Object.fromEntries(Object.entries(best).map(([c, m]) => [c, Object.fromEntries(Object.entries(m).sort().map(([k, v]) => [k, v.at]))]));
const dest = path.resolve(import.meta.dirname, '..', 'public', 'cities.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`wrote ${dest}: ${Object.entries(out).map(([c, m]) => `${c} ${Object.keys(m).length} names`).join(', ')}`);
