import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { SiteMode } from '../data/types';
import type { LiveStatus } from './liveStatus';

interface Opt<K extends string> {
  key: K;
  label: string;
}
interface TopBarProps<V extends string> {
  ref?: Ref<HTMLElement>;
  mobile: boolean;
  views: Opt<V>[];
  view: V;
  onView: (v: V) => void;
  modes: Opt<SiteMode>[];
  mode: SiteMode;
  onMode: (m: SiteMode) => void;
  live: boolean;
  onLive: () => void;
  /** What the feed delivers while Live is on (liveStatus). */
  liveStatus: LiveStatus;
  search: ReactNode;
  onTour: () => void;
  onReset: () => void;
  totals: { entities: number; posts: number; hubs: number; orphans: number };
}

const SHORT: Record<SiteMode, string> = { both: 'Both', travelmemo: 'EN', reisememo: 'DE' };

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden>
        <i />
        <i />
      </span>
      <span>
        <span className="t">Travel</span> Ontology
      </span>
    </div>
  );
}

/** The orange play glyph: the only orange on the tour button (#65). */
function PlayGlyph() {
  return (
    <svg className="glyph" width="9" height="10" viewBox="0 0 9 10" aria-hidden>
      <path d="M0.5 0.5v9l8-4.5z" />
    </svg>
  );
}

/**
 * Live as an on-air pill (#65, lookbook B). Off: greyed, an orange arrow before
 * "Offline". On: steady green "Live · 30 min", or amber with what is missing
 * while the feed is degraded. The accessible name stays "Live activity" and
 * aria-pressed carries on/off; the label and tooltip carry the feed state.
 */
function LivePill({ on, status, compact, onClick }: { on: boolean; status: LiveStatus; compact: boolean; onClick: () => void }) {
  const tone = !on ? 'off' : status.tone === 'ok' ? 'on' : 'on degraded';
  // On a phone the degraded state keeps a short text cue, not colour alone (#73 review).
  const text = !on ? 'Offline' : compact ? status.tiny : `Live · ${status.short}`;
  return (
    <button className={`live-pill ${tone}`} onClick={onClick} aria-pressed={on} aria-label="Live activity" aria-describedby="live-pill-state" title={on ? status.long : 'Live activity is off'}>
      {on ? <span className="live-dot" aria-hidden /> : <PlayGlyph />}
      {text}
      <span id="live-pill-state" className="sr-only">
        {on ? status.long : 'Off'}
      </span>
    </button>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="tstat">
      <b>{n.toLocaleString('en')}</b>
      <span>{label}</span>
    </div>
  );
}

/** Brand, views, mode, search, live toggle and actions in one bar (two compact rows on phones). */
export function TopBar<V extends string>(p: TopBarProps<V>) {
  const [open, setOpen] = useState(false);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) pop.current?.querySelector('input')?.focus();
  }, [open]);
  const graph = p.view === 'graph';
  const label = (l: string) => (p.mobile ? l.replace(/^\S+\s(?=\S)/, '') : l);
  const tabs = (
    <div className="seg">
      {p.views.map((v) => (
        <button key={v.key} className={p.view === v.key ? 'on' : ''} onClick={() => p.onView(v.key)}>
          {label(v.label)}
        </button>
      ))}
    </div>
  );
  const modes = graph && (
    <div className="seg">
      {p.modes.map((m) => (
        <button key={m.key} className={p.mode === m.key ? 'on' : ''} onClick={() => p.onMode(m.key)}>
          {p.mobile ? SHORT[m.key] : m.label}
        </button>
      ))}
    </div>
  );
  const liveBtn = graph && <LivePill on={p.live} status={p.liveStatus} compact={p.mobile} onClick={p.onLive} />;

  if (p.mobile)
    return (
      <header ref={p.ref} className="hud topbar">
        <div className="tb-row">
          <Brand />
          {liveBtn}
          <div className="row">
            <button aria-label="Search" aria-expanded={open} onClick={() => setOpen(!open)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="7" cy="7" r="5" />
                <path d="M11 11l4 4" />
              </svg>
            </button>
            <button aria-label="Reset view" title="Reset view" onClick={p.onReset}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3 8a5 5 0 1 0 1.5-3.6" />
                <path d="M3 2v3h3" />
              </svg>
            </button>
            <button className="tour-btn" onClick={p.onTour}>
              <PlayGlyph />
              Tour
            </button>
          </div>
        </div>
        <div className="tb-row tb-scroll">
          {tabs}
          {modes}
        </div>
        {open && (
          <div ref={pop} className="search-pop">
            {p.search}
            <button className="linkish close" aria-label="Close search" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>
        )}
      </header>
    );

  return (
    <header ref={p.ref} className="hud topbar">
      <Brand />
      {tabs}
      {modes}
      {p.search}
      <div className="row actions">
        <button className="ghost tour-btn" onClick={p.onTour}>
          <PlayGlyph />
          Guided tour
        </button>
        <button className="ghost" onClick={p.onReset}>
          Reset view
        </button>
      </div>
      {liveBtn}
      <div className="topbar-stats">
        <Stat n={p.totals.entities} label="entities" />
        <Stat n={p.totals.posts} label="articles" />
        <Stat n={p.totals.hubs} label="hubs" />
        <Stat n={p.totals.orphans} label="orphans" />
      </div>
    </header>
  );
}
