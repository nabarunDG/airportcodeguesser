import { gaugeNeedleDeg } from '../../../lib/gameLogic';
import './CockpitGauge.css';

interface Props {
  /** Dial name, e.g. "SCORE". */
  label: string;
  /** 'face' prints the label inside the dial (the big score dial); 'above'
      sets it as a caption over the plate — the small dials are too tiny for
      legible in-face lettering. */
  labelPosition?: 'face' | 'above';
  value: number;
  max: number;
  /** Values that get a long tick + printed numeral. */
  majors: number[];
  /** Evenly spaced short ticks between consecutive majors. */
  minorsPerInterval: number;
  /** Value range highlighted with an accent arc (the score dial's bonus zone). */
  accentZone?: [number, number];
  /** Rendered width in px. */
  size: number;
}

/** Clockwise dial angle (degrees from +x, y-down) for a value — 270° sweep from the 7-o'clock stop. */
function dialDeg(value: number, max: number): number {
  return 135 + 270 * Math.min(1, Math.max(0, max > 0 ? value / max : 0));
}

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
}

const fmt = (n: number) => n.toFixed(1);

/**
 * One round cockpit instrument, replicating the reference dials in the design
 * package (assets/gauges/): square mounting plate with corner screws, dark
 * face, a 270° scale, and a sprung needle. Pure SVG — no image assets.
 */
export default function CockpitGauge({ label, labelPosition = 'face', value, max, majors, minorsPerInterval, accentZone, size }: Props) {
  // Caption-above dials render small, so their numerals get a bigger cut.
  const numeralSize = labelPosition === 'above' ? 24 : majors.length > 8 ? 14 : 13;
  const ticks: React.ReactNode[] = [];
  majors.forEach((m, i) => {
    const deg = dialDeg(m, max);
    const [x1, y1] = polar(78, deg);
    const [x2, y2] = polar(63, deg);
    const [lx, ly] = polar(50, deg);
    ticks.push(<line key={`M${m}`} x1={fmt(x1)} y1={fmt(y1)} x2={fmt(x2)} y2={fmt(y2)} stroke="var(--color-text)" strokeWidth="3" />);
    ticks.push(
      <text key={`L${m}`} x={fmt(lx)} y={fmt(ly + numeralSize / 3)} textAnchor="middle" fill="var(--color-text)" fontSize={numeralSize} fontWeight="600" fontFamily="var(--font-body)">
        {m}
      </text>,
    );
    if (i < majors.length - 1) {
      const next = majors[i + 1];
      for (let k = 1; k <= minorsPerInterval; k++) {
        const v = m + ((next - m) * k) / (minorsPerInterval + 1);
        const mdeg = dialDeg(v, max);
        const [mx1, my1] = polar(78, mdeg);
        const [mx2, my2] = polar(70, mdeg);
        ticks.push(<line key={`m${m}-${k}`} x1={fmt(mx1)} y1={fmt(my1)} x2={fmt(mx2)} y2={fmt(my2)} stroke="var(--color-text)" strokeWidth="1.4" />);
      }
    }
  });

  let accentArc: React.ReactNode = null;
  if (accentZone) {
    const [from, to] = accentZone;
    const d1 = dialDeg(from, max);
    const d2 = dialDeg(to, max);
    const [ax, ay] = polar(73, d1);
    const [bx, by] = polar(73, d2);
    const largeArc = d2 - d1 > 180 ? 1 : 0;
    accentArc = (
      <path
        d={`M${fmt(ax)},${fmt(ay)} A73,73 0 ${largeArc} 1 ${fmt(bx)},${fmt(by)}`}
        fill="none"
        stroke="var(--color-accent-600)"
        strokeWidth="5"
      />
    );
  }

  const screws = (
    [
      [18, 18],
      [182, 18],
      [18, 182],
      [182, 182],
    ] as const
  ).map(([cx, cy]) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="5.5" fill="var(--gg-screw)" stroke="var(--gg-screw-ring)" strokeWidth="1" />
      <line x1={cx - 3} y1={cy + 2.2} x2={cx + 3} y2={cy - 2.2} stroke="var(--color-neutral-700)" strokeWidth="1.4" />
    </g>
  ));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      {labelPosition === 'above' && (
        // Same lettering as the big dial's in-face "SCORE" (10.5 viewBox units
        // at 172px ≈ 9px rendered, letter-spacing ≈ 1.7px, neutral-300).
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1.7, color: 'var(--color-neutral-300)', textTransform: 'uppercase' }}>
          {label}
        </span>
      )}
      <svg
        className="gc-gauge"
        viewBox="0 0 200 200"
        width={size}
        role="img"
        aria-label={`${label} gauge: ${value} of ${max}`}
      >
        <rect x="2" y="2" width="196" height="196" rx="20" fill="var(--gg-plate)" stroke="var(--color-neutral-800)" strokeWidth="1.5" />
        {screws}
        <circle cx="100" cy="100" r="88" fill="var(--gg-bezel)" />
        <circle cx="100" cy="100" r="80" fill="var(--gg-face)" stroke="var(--gg-face-ring)" strokeWidth="1" />
        {accentArc}
        {ticks}
        {labelPosition === 'face' && (
          <text x="100" y="80" textAnchor="middle" fill="var(--color-neutral-300)" fontSize="10.5" fontWeight="600" letterSpacing="2" fontFamily="var(--font-body)">
            {label}
          </text>
        )}
        <g className="gc-gauge-needle" style={{ transform: `rotate(${gaugeNeedleDeg(value, max)}deg)` }}>
          <polygon points="100,34 104,100 100,116 96,100" fill="var(--color-neutral-100)" stroke="var(--gg-bezel)" strokeWidth="0.8" />
        </g>
        <circle cx="100" cy="100" r="8" fill="var(--gg-hub)" stroke="var(--gg-screw-ring)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="2.5" fill="var(--color-neutral-600)" />
        {/* Glass glint. */}
        <path d="M40,58 A76,76 0 0 1 132,32" fill="none" stroke="color-mix(in srgb, var(--color-text) 10%, transparent)" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </div>
  );
}
