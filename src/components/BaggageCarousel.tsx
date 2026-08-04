import { useMemo } from 'react';
import './BaggageCarousel.css';

// A pool of recognizable real IATA codes — reads as an authentic baggage tag
// rather than gibberish letters. Three distinct codes are drawn at random
// each time the carousel mounts.
const CODE_POOL = ['JFK', 'LAX', 'ORD', 'LHR', 'CDG', 'HND', 'DXB', 'SYD', 'GRU', 'SIN', 'AMS', 'FRA', 'ICN', 'YYZ'];

function pickThreeCodes(): [string, string, string] {
  const pool = CODE_POOL.slice();
  const picked: string[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked as [string, string, string];
}

/**
 * The baggage-belt visual from the design prototype's Loading screen
 * (diagonal-stripe belt + three suitcases looping across it) — reused here
 * as a standalone decorative component. Originally gated behind the actual
 * data fetch (see BootScreen); also used on the Home screen purely as a
 * themed flourish, with no loading semantics attached.
 */
export default function BaggageCarousel() {
  const [codeA, codeB, codeC] = useMemo(pickThreeCodes, []);

  return (
    <div className="gc-belt">
      <div className="gc-belt-stripe" />
      <div className="gc-bag gc-bag--a">
        <div className="gc-bag-handle" />
        <span className="gc-bag-tag">{codeA}</span>
      </div>
      <div className="gc-bag gc-bag--b">
        <div className="gc-bag-handle" />
        <span className="gc-bag-tag">{codeB}</span>
      </div>
      <div className="gc-bag gc-bag--c">
        <div className="gc-bag-handle" />
        <span className="gc-bag-tag">{codeC}</span>
      </div>
    </div>
  );
}
