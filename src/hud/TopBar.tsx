import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import type { SiteMode } from '../data/types';

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
  liveText: string;
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
  const liveBtn = graph && (
    <div className="row live-row">
      <button className={p.live ? 'on' : ''} onClick={p.onLive} aria-pressed={p.live}>
        <span className="live-dot" /> Live
      </button>
      {!p.mobile && p.live && <span className="live-status">{p.liveText}</span>}
    </div>
  );

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
            <button className="primary" onClick={p.onTour}>
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
      {liveBtn}
      <div className="row">
        <button className="primary" onClick={p.onTour}>
          ▶ Guided tour
        </button>
        <button onClick={p.onReset}>Reset view</button>
      </div>
      <div className="topbar-stats">
        <Stat n={p.totals.entities} label="entities" />
        <Stat n={p.totals.posts} label="articles" />
        <Stat n={p.totals.hubs} label="hubs" />
        <Stat n={p.totals.orphans} label="orphans" />
      </div>
    </header>
  );
}
