import './SplitFlapLogo.css';

/**
 * The three-tile split-flap logo, cycling JFK→CDG→HND→GRU→SYD→DXB every 3s.
 * Fully static/decorative — no state, no props — the letter-cycling and
 * squash-flick are pure CSS (`::before { content }` swaps driven by
 * step-end keyframes; see src/styles/animations.css).
 */
export default function SplitFlapLogo() {
  return (
    <span className="gc-flap-group">
      <span className="gc-flap gc-flap--1" />
      <span className="gc-flap gc-flap--2" />
      <span className="gc-flap gc-flap--3" />
    </span>
  );
}
