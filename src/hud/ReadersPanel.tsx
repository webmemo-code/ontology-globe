import type { Ref } from 'react';
import { PanelHead } from './PanelHead';
import type { ReadingRow } from './derive';

const BARS = 26;

function SplitBar({ split }: { split: [number, number] }) {
  return (
    <div className="split" aria-hidden>
      <i style={{ width: `${split[0]}%` }} />
    </div>
  );
}

/** Big count of active reads, its history and the blog split (null hides the split). */
export function ReadersPanel({ total, split, history }: { total: number; split: [number, number] | null; history: number[] }) {
  const bars = history.slice(-BARS);
  const max = Math.max(1, ...bars);
  return (
    <section className="hud panel readers" aria-label="Readers now">
      <PanelHead dot="orange" label="Readers now" />
      <div className="big-row">
        <b key={total} className="big flick">{total}</b>
        <span>active reads in the last 30 min</span>
      </div>
      {bars.length >= 3 ? (
        <div className="spark" aria-hidden>
          {Array.from({ length: BARS - bars.length }, (_, i) => <i key={`g${i}`} className="gap" />)}
          {bars.map((v, i) => (
            <i key={i} className={i === bars.length - 1 ? 'last' : ''} style={{ height: `${Math.max(8, (v / max) * 100)}%` }} />
          ))}
        </div>
      ) : (
        <p className="note">collecting…</p>
      )}
      {split && (
        <>
          <SplitBar split={split} />
          <div className="split-l">
            <span>Travelmemo {split[0]}%</span>
            <span>Reisememo {split[1]}%</span>
          </div>
        </>
      )}
    </section>
  );
}

/** One-line readers strip for phones. */
export function ReadersStrip({ total, split, ref }: { total: number; split: [number, number] | null; ref?: Ref<HTMLElement> }) {
  return (
    <section ref={ref} className="hud readers-strip" aria-label="Readers now">
      <span className="pdot orange" />
      <b key={total} className="flick">{total}</b>
      <span className="muted">active reads</span>
      {split && <SplitBar split={split} />}
    </section>
  );
}

/** Newest reader rows; each flies to the article. */
export function ReadingPanel({
  rows,
  onPick,
  active,
  follow,
  onFollow,
}: {
  rows: ReadingRow[];
  onPick: (key: string, row?: string) => void;
  /** The row live follow is showing. */
  active?: string | null;
  /** Live follow on: the camera flies to each newly seen visitor, reader or bot. */
  follow: boolean;
  onFollow: () => void;
}) {
  const toggle = (
    <button className={`follow-toggle${follow ? ' on' : ''}`} onClick={onFollow} aria-pressed={follow} aria-label="Follow" title="Fly to each new visitor, reader or AI agent">
      {follow ? 'Camera follows' : 'Follow'}
    </button>
  );
  return (
    <section className="hud panel reading" aria-label="Now reading">
      <PanelHead dot="orange" label="Now reading" right={toggle} />
      <ul className="rows">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className={r.id === active ? 'flick following' : 'flick'} aria-current={r.id === active || undefined}>
            <button onClick={() => r.pick && onPick(r.pick, r.id)} title={r.what}>
              <span className="who">{r.who}</span>
              <span className="what">→ {r.what}</span>
              <span className={`tag tag-reader${r.site === 'reisememo' ? ' de' : ''}`}>{r.site === 'travelmemo' ? 'EN' : 'DE'}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="note">Nothing in the last 30 min</li>}
      </ul>
    </section>
  );
}
