import type { ReactNode } from 'react';

/** Dot, mono label and an optional right-aligned note. */
export function PanelHead({ dot, label, right }: { dot: 'orange' | 'blue'; label: string; right?: ReactNode }) {
  return (
    <div className="ph">
      <span className={`pdot ${dot}`} />
      {label}
      {right !== undefined && <span className="right">{right}</span>}
    </div>
  );
}
