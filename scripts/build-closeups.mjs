// Scale each article's larger photo (.cache/closeups/{site}/, from
// scripts/fetch_closeups.py) to public/closeups/{site}/{id}.jpg for the
// close-up tiles: the dome swaps these in, a few at a time, for the tiles
// nearest the camera, where the 64 px atlas cell would be a blur. 320 px
// wide keeps a photo recognisable when its tile fills the screen and each
// file around 15 KB. Also writes index.json, the keys that have a file, so
// the viewer never asks for one that is not there. A site without a download
// cache keeps its published entries (those whose file is still there), so
// refreshing one blog never hides the other's close-ups.
//
//   node scripts/build-closeups.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const WIDTH = 320;
const indexPath = path.join(ROOT, 'public', 'closeups', 'index.json');
const published = JSON.parse(await fs.readFile(indexPath, 'utf8').catch(() => '[]'));
const keys = [];
let bytes = 0;
for (const site of ['travelmemo', 'reisememo']) {
  const src = path.join(ROOT, '.cache', 'closeups', site);
  const out = path.join(ROOT, 'public', 'closeups', site);
  await fs.mkdir(out, { recursive: true });
  let files = [];
  try {
    files = await fs.readdir(src);
  } catch {
    const kept = [];
    for (const k of published.filter((k) => k.startsWith(`post:${site}:`))) {
      const ok = await fs.stat(path.join(out, `${k.split(':')[2]}.jpg`)).then(() => true, () => false);
      if (ok) kept.push(k);
    }
    keys.push(...kept);
    console.warn(`no download cache for ${site}: kept its ${kept.length} published close-ups (run scripts/fetch_closeups.py --site ${site} to refresh)`);
    continue;
  }
  for (const f of files) {
    const id = path.parse(f).name;
    const target = path.join(out, `${id}.jpg`);
    try {
      await sharp(path.join(src, f)).resize({ width: WIDTH, height: WIDTH, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 70, mozjpeg: true }).toFile(target);
      bytes += (await fs.stat(target)).size;
      keys.push(`post:${site}:${id}`);
    } catch (err) {
      console.warn(`skip ${site}/${f}: ${err.message}`);
    }
  }
}
keys.sort();
await fs.writeFile(indexPath, JSON.stringify(keys));
console.log(`${keys.length} close-ups, ${Math.round(bytes / 1024)} KB`);
