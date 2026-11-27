import { useEffect, useState, type RefObject } from 'react';

/**
 * Page dots under the phone's swipeable panels: how many there are and which
 * one is in view, so the row reads as a carousel. Decorative (swipe is the
 * interaction); the panels themselves stay in the reading order.
 */
export function CardDots({ cards, count }: { cards: RefObject<HTMLDivElement | null>; count: number }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = cards.current;
    if (!el) return;
    const onScroll = () => {
      const first = el.firstElementChild as HTMLElement | null;
      if (!first) return;
      const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0');
      // At the far end the last card may not reach the start: count it as reached.
      const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
      setActive(end ? el.children.length - 1 : Math.round(el.scrollLeft / Math.max(step, 1)));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [cards, count]);
  if (count < 2) return null;
  return (
    <div className="card-dots" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={i === active ? 'on' : ''} />
      ))}
    </div>
  );
}
