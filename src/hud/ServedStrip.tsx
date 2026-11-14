import type { Ref } from 'react';
import { PanelHead } from './PanelHead';
import { SERVED_KEYS, type Served } from './derive';

/** What was served in the window, per output: a strip on desktop, a list card on phones. */
export function ServedStrip({ served, list, ref }: { served: Served; list?: boolean; ref?: Ref<HTMLElement> }) {
  const pairs = SERVED_KEYS.map((k) => (
    <span key={k} className="pair">
      {k}
      <b key={served[k]} className="flick">{served[k]}</b>
    </span>
  ));
  if (list)
    return (
      <section ref={ref} className="hud panel served-list" aria-label="Served">
        <PanelHead dot="orange" label="Served" />
        <div className="served-pairs">{pairs}</div>
      </section>
    );
  return (
    <section ref={ref} className="hud served" aria-label="Served">
      <span className="ph">
        <span className="pdot orange" />
        Served
      </span>
      {pairs}
    </section>
  );
}
