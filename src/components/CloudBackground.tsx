const CLOUD_PATH = 'M50 32a9 9 0 0 0 1-17.9 13 13 0 0 0-24.6-4.4A10.5 10.5 0 0 0 13 32Z';

const CLOUDS = [
  { top: '9%', opacity: 0.5, blur: 1.5, width: 150, height: 94, duration: 95, delay: 0, fill: 'var(--color-neutral-900)' },
  { top: '38%', opacity: 0.35, blur: 2.5, width: 110, height: 69, duration: 130, delay: -70, fill: 'var(--color-accent-900)' },
  { top: '66%', opacity: 0.45, blur: 2, width: 190, height: 119, duration: 110, delay: -35, fill: 'var(--color-neutral-900)' },
  { top: '84%', opacity: 0.3, blur: 3, width: 90, height: 56, duration: 150, delay: -110, fill: 'var(--color-neutral-900)' },
];

/** Four translucent drifting clouds, fixed behind all content. Purely decorative. */
export default function CloudBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      {CLOUDS.map((c, i) => (
        <svg
          key={i}
          style={{
            position: 'absolute',
            top: c.top,
            opacity: c.opacity,
            filter: `blur(${c.blur}px)`,
            animation: `gcDrift ${c.duration}s linear infinite`,
            animationDelay: `${c.delay}s`,
          }}
          width={c.width}
          height={c.height}
          viewBox="0 0 64 40"
          fill={c.fill}
        >
          <path d={CLOUD_PATH} />
        </svg>
      ))}
    </div>
  );
}
