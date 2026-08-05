import './SplitFlapLogo.css';

interface Props {
  /** 'sm' (default) matches the header brand mark; 'lg' is sized for standalone display, e.g. the Home screen. */
  size?: 'sm' | 'lg';
}

/**
 * The three-tile split-flap logo, cycling JFK→CDG→HND→GRU→SYD→DXB every 3s.
 * Fully static/decorative — no state besides the size variant — the
 * letter-cycling and squash-flick are pure CSS (`::before { content }` swaps
 * driven by step-end keyframes; see src/styles/animations.css).
 */
export default function SplitFlapLogo({ size = 'sm' }: Props) {
  return (
    <span className={`gc-flap-group ${size === 'lg' ? 'gc-flap-group--lg' : ''}`}>
      <span className="gc-flap gc-flap--1" />
      <span className="gc-flap gc-flap--2" />
      <span className="gc-flap gc-flap--3" />
    </span>
  );
}
