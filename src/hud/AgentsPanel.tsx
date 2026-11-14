import { PanelHead } from './PanelHead';
import { TIER_LABELS, routeLabel, type ReadingRow } from './derive';

/** AI agent fetches, newest first; each row flies to its target. */
export function AgentsPanel({ rows, count, onPick }: { rows: ReadingRow[]; count: number; onPick: (key: string) => void }) {
  return (
    <section className="hud panel agents" aria-label="AI agents">
      <PanelHead dot="blue" label="AI agents" right={<span key={count} className="flick">{count} fetches</span>} />
      <ul className="rows">
        {rows.slice(0, 5).map((r) => (
          <li key={r.id} className="flick">
            <button onClick={() => r.pick && onPick(r.pick)} title={r.what}>
              <span className="who">{r.who}</span>
              <span className="tag tag-bot">{TIER_LABELS[r.tier!]}</span>
              <span className="what">→ {r.what}</span>
              {routeLabel(r.route) && <span className="route-pill">{routeLabel(r.route)}</span>}
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="note">No fetches in the last 30 min</li>}
      </ul>
    </section>
  );
}
