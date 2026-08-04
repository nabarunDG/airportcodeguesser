import './BaggageCarousel.css';

/**
 * The baggage-belt visual from the design prototype's Loading screen
 * (diagonal-stripe belt + three suitcases looping across it) — reused here
 * as a standalone decorative component. Originally gated behind the actual
 * data fetch (see BootScreen); also used on the Home screen purely as a
 * themed flourish, with no loading semantics attached.
 */
export default function BaggageCarousel() {
  return (
    <div className="gc-belt">
      <div className="gc-belt-stripe" />
      <div className="gc-bag gc-bag--a">
        <div className="gc-bag-handle" />
      </div>
      <div className="gc-bag gc-bag--b">
        <div className="gc-bag-handle" />
      </div>
      <div className="gc-bag gc-bag--c">
        <div className="gc-bag-handle" />
      </div>
    </div>
  );
}
