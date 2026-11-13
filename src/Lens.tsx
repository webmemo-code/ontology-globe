import { useEffect, useMemo, useRef } from 'react';
import { postKey } from './data/globe';
import { PERF_RANK, descendants, labelFor, placeTree, postsFor } from './data/model';
import type { Graph, GraphNode, GraphPost, SiteKey, SiteMode } from './data/types';

const MAX_TILES = 40;

interface LensProps {
  node: GraphNode;
  graph: Graph;
  mode: SiteMode;
  byKey: Map<string, GraphNode>;
  onPick: (key: string) => void;
  titleOf: (post: GraphPost) => string;
  closeups: Set<string>;
  anchor: () => { x: number; y: number } | null;
}

/** Magnifier for a selected place: regions inside it, its article photos, and a leader line to the globe. */
export function Lens({ node, graph, mode, byKey, onPick, titleOf, closeups, anchor }: LensProps) {
  const tree = useMemo(() => placeTree(graph), [graph]);
  const panel = useRef<HTMLElement>(null);
  const inside = useRef<HTMLDivElement>(null);
  const tiles = useRef<HTMLDivElement>(null);
  const line = useRef<SVGLineElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const anchorRef = useRef(anchor);
  anchorRef.current = anchor;

  const posts = useMemo(() => postsFor(graph, mode), [graph, mode]);
  const under = useMemo(() => descendants(tree, node.key), [tree, node.key]);
  const mine = useMemo(
    () =>
      posts
        .filter((p) => p.entities.some((e) => under.has(e)))
        .sort((a, b) => PERF_RANK[b.perf] - PERF_RANK[a.perf] || b.id - a.id),
    [posts, under],
  );

  const crumbs = useMemo(() => {
    const out: GraphNode[] = [];
    const seen = new Set([node.key]);
    for (let k = tree.parent.get(node.key); k && !seen.has(k); k = tree.parent.get(k)) {
      seen.add(k);
      const n = byKey.get(k);
      if (n) out.unshift(n);
    }
    return out;
  }, [tree, node.key, byKey]);

  const sites: SiteKey[] = mode === 'both' ? ['travelmemo', 'reisememo'] : [mode];
  const kids = useMemo(() => {
    const list = (tree.children.get(node.key) ?? []).flatMap((k) => {
      const child = byKey.get(k);
      if (!child) return [];
      const set = descendants(tree, k);
      const n: Record<SiteKey, number> = { travelmemo: 0, reisememo: 0 };
      for (const p of posts) if (p.entities.some((e) => set.has(e))) n[p.site]++;
      return n.travelmemo + n.reisememo > 0 ? [{ child, n, total: n.travelmemo + n.reisememo }] : [];
    });
    return list.sort((a, b) => b.total - a.total);
  }, [tree, node.key, byKey, posts]);
  const max = Math.max(1, ...kids.flatMap((k) => sites.map((s) => k.n[s])));
  const width = (n: number) => `${(Math.log10(1 + n) / Math.log10(1 + max)) * 100}%`;

  // New place: rows back to the start.
  useEffect(() => {
    if (inside.current) inside.current.scrollLeft = 0;
    if (tiles.current) tiles.current.scrollLeft = 0;
  }, [node.key]);

  // Leader line follows the globe every frame; attributes are set directly, not via state.
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const a = anchorRef.current();
      const box = panel.current?.getBoundingClientRect();
      const l = line.current;
      const c = ring.current;
      if (l && c) {
        if (a && box) {
          l.setAttribute('x1', String(a.x));
          l.setAttribute('y1', String(a.y));
          l.setAttribute('x2', String(Math.min(Math.max(a.x, box.left + 12), box.right - 12)));
          l.setAttribute('y2', String(box.top));
          c.setAttribute('cx', String(a.x));
          c.setAttribute('cy', String(a.y));
          l.removeAttribute('visibility');
          c.removeAttribute('visibility');
        } else {
          l.setAttribute('visibility', 'hidden');
          c.setAttribute('visibility', 'hidden');
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <>
      <svg className="lens-lead" aria-hidden>
        <line ref={line} visibility="hidden" />
        <circle ref={ring} r="6" visibility="hidden" />
      </svg>
      <aside key={node.key} ref={panel} className="hud lens lens-in" aria-label={`Lens: ${labelFor(node, mode)}`}>
        <div className="lens-head">
          <nav className="lens-crumbs" aria-label="Place path">
            {crumbs.map((c) => (
              <span key={c.key}>
                <button onClick={() => onPick(c.key)}>{labelFor(c, mode)}</button>
                <i aria-hidden>›</i>
              </span>
            ))}
            <b>{labelFor(node, mode)}</b>
          </nav>
          <span className="lens-tag">
            <span className="lens-dot" /> Lens
          </span>
          <span className="lens-count">{mine.length.toLocaleString('en')} articles</span>
        </div>

        {kids.length > 0 && (
          <>
            <h3>Inside</h3>
            <div ref={inside} className="lens-row">
              {kids.map(({ child, n }) => (
                <button key={child.key} className="lens-kid" onClick={() => onPick(child.key)}>
                  <span className="lens-name">{labelFor(child, mode)}</span>
                  {sites.map((s) => (
                    <span key={s} className="lens-bar">
                      <span className={s === 'travelmemo' ? 'en' : 'de'} style={{ width: width(n[s]) }} />
                    </span>
                  ))}
                  <span className="lens-nums">
                    {sites.map((s) => (
                      <span key={s} className={s === 'travelmemo' ? 'en' : 'de'}>
                        {n[s]}
                      </span>
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <h3>Articles</h3>
        <div ref={tiles} className="lens-row">
          {mine.slice(0, MAX_TILES).map((p) => (
            <button key={postKey(p)} className="lens-tile" onClick={() => onPick(postKey(p))}>
              <span className="lens-img">
                {closeups.has(postKey(p)) && <img src={`closeups/${p.site}/${p.id}.jpg`} alt="" loading="lazy" />}
                <span className={`lens-lang ${p.site === 'travelmemo' ? 'en' : 'de'}`}>{p.site === 'travelmemo' ? 'EN' : 'DE'}</span>
              </span>
              <span className="lens-title">{titleOf(p)}</span>
            </button>
          ))}
          {mine.length > MAX_TILES && <span className="lens-more">+ {mine.length - MAX_TILES} more</span>}
          {mine.length === 0 && <span className="lens-more">No articles here yet</span>}
        </div>
      </aside>
    </>
  );
}
