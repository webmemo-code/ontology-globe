import { PanelHead } from './PanelHead';
import { TIER_LABELS, routeLabel, type ReadingRow } from './derive';
import { botIcon } from '../data/live';

/** AI agent fetches, newest first; each row flies to its target. */
export function AgentsPanel({ rows, count, onPick, active }: { rows: ReadingRow[]; count: number; onPick: (key: string, row?: string) => void; active?: string | null }) {
  return (
    <section className="hud panel agents" aria-label="AI agents">
      <PanelHead dot="blue" label="AI agents" right={<span key={count} className="flick">{count} fetches</span>} />
      <ul className="rows">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className={r.id === active ? 'flick following' : 'flick'} aria-current={r.id === active || undefined}>
            <button onClick={() => r.pick && onPick(r.pick, r.id)} title={r.what}>
              <span className="who">
                {/* The crawler's site icon; an empty slot keeps the names aligned when there is none. */}
                <span className="bot-icon" aria-hidden="true">
                  {r.bot && botIcon(r.bot) && <img src={botIcon(r.bot)!} alt="" width={14} height={14} loading="lazy" />}
                </span>
                {r.who}
              </span>
              <span className="tag tag-bot">{TIER_LABELS[r.tier!]}</span>
              <span className="what">→ {r.what}</span>
              {routeLabel(r.route) && <span className="route-pill">{routeLabel(r.route)}</span>}
              {/* Which blog the agent fetched from: blue like the other bot chips, DE grey as on reader rows. */}
              <span className={`tag tag-site${r.site === 'reisememo' ? ' de' : ''}`}>{r.site === 'travelmemo' ? 'EN' : 'DE'}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="note">No fetches in the last 30 min</li>}
      </ul>
    </section>
  );
}
