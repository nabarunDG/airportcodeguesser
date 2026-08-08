import type { StampRecord } from '../../../types';
import { BATCH_SIZE } from '../../../lib/gameLogic';
import PassportStamp from '../../PassportStamp';

interface Props {
  stamps: StampRecord[];
  /** Plays the press animation on the newest stamp (reveal-screen strip). */
  animateLast?: boolean;
  /** Mini variant for the reveal screen's progress row. */
  small?: boolean;
}

/** How many dashed empty slots to draw before collapsing the rest into "+N". */
function visibleEmpties(earned: number, remaining: number): number {
  return Math.min(remaining, Math.max(2, 5 - earned));
}

/**
 * The persistent journey strip: earned stamps (mini, tilted — the dies keep
 * their own hashes) plus dashed empty slots up to the batch's 10, overflow
 * collapsed into a "+N" tail. From five stamps up the ribbon splits into two
 * centered rows instead of bleeding off a phone's edges.
 */
export default function StampStrip({ stamps, animateLast = false, small = false }: Props) {
  const remaining = Math.max(0, BATCH_SIZE - stamps.length);
  const empties = visibleEmpties(stamps.length, remaining);
  const overflow = remaining - empties;
  // The dies are two aspect ratios; the wide ones need a few more px to read.
  const stampWidth = (continent: string) => {
    const wide = continent === 'AS' || continent === 'NA' || continent === 'OC';
    return small ? (wide ? 38 : 30) : wide ? 54 : 42;
  };
  const slotSize = small ? 22 : 30;

  const items: React.ReactNode[] = [
    ...stamps.map((stamp, i) => (
      <PassportStamp
        key={`${stamp.iata}-${i}`}
        stamp={stamp}
        width={stampWidth(String(stamp.continent))}
        animate={animateLast && i === stamps.length - 1}
      />
    )),
    ...Array.from({ length: empties }, (_, i) => (
      <span
        key={`empty-${i}`}
        aria-hidden="true"
        style={{
          width: slotSize,
          height: slotSize,
          border: '1.5px dashed var(--color-neutral-800)',
          borderRadius: '50%',
          flex: 'none',
        }}
      />
    )),
    ...(overflow > 0
      ? [
          <span key="overflow" style={{ fontSize: 10, color: 'var(--color-neutral-700)' }}>
            +{overflow}
          </span>,
        ]
      : []),
  ];

  // Two even rows once the ribbon would run wider than a phone.
  const rows = stamps.length >= 5 ? [items.slice(0, Math.ceil(items.length / 2)), items.slice(Math.ceil(items.length / 2))] : [items];

  return (
    <div
      aria-label={`${stamps.length} of ${BATCH_SIZE} stamps collected`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        background: small ? 'transparent' : 'var(--color-surface)',
        borderRadius: 'var(--radius-md)',
        boxShadow: small ? 'none' : 'var(--shadow-sm)',
        padding: small ? 0 : '8px 12px',
      }}
    >
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {row}
        </div>
      ))}
    </div>
  );
}
