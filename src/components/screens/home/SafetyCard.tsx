import './SafetyCard.css';

/**
 * The below-the-fold "how to play" block, styled as a laminated seatback
 * safety card — 2×2 numbered panels, bilingual subline, one joke. See
 * SafetyCard.css for why this surface gets non-Nocturne print colors.
 */
export default function SafetyCard() {
  return (
    <div className="gc-safety">
      <div className="gc-safety-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="gc-safety-title">SAFETY BRIEFING</span>
          <span className="gc-safety-subtitle">Instrucciones de juego · 遊び方</span>
        </div>
        <span className="gc-safety-code">GC-101</span>
      </div>
      <div className="gc-safety-grid">
        <div className="gc-safety-panel">
          <span className="gc-safety-num">1</span>
          <div className="gc-safety-art" style={{ gap: 3 }}>
            <span className="gc-safety-tile">D</span>
            <span className="gc-safety-tile">X</span>
            <span className="gc-safety-tile">B</span>
          </div>
          <span className="gc-safety-caption">Read the 3-letter code</span>
        </div>
        <div className="gc-safety-panel">
          <span className="gc-safety-num">2</span>
          <div className="gc-safety-art" style={{ flexDirection: 'column', gap: 3 }}>
            <span className="gc-safety-pill">AIRLINES</span>
            <span className="gc-safety-pill gc-safety-pill--filled">DESTINATIONS ✓</span>
          </div>
          <span className="gc-safety-caption">Pull clues</span>
        </div>
        <div className="gc-safety-panel">
          <span className="gc-safety-num">3</span>
          <div className="gc-safety-art" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 3 }}>
            <span className="gc-safety-bar" />
            <span className="gc-safety-bar gc-safety-bar--picked">✓</span>
            <span className="gc-safety-bar" />
          </div>
          <span className="gc-safety-caption">Pick the airport</span>
        </div>
        <div className="gc-safety-panel">
          <span className="gc-safety-num">4</span>
          <div className="gc-safety-art" style={{ gap: 4 }}>
            <span className="gc-safety-stamp" style={{ border: '2px solid #c23b2e', color: '#c23b2e', transform: 'rotate(-8deg)' }}>GRU</span>
            <span className="gc-safety-stamp" style={{ border: '2px solid #2f5fa8', color: '#2f5fa8', transform: 'rotate(5deg)' }}>LHR</span>
            <span className="gc-safety-stamp" style={{ border: '2px dashed rgba(34,49,94,0.35)' }} />
          </div>
          <span className="gc-safety-caption">Collect your stamps</span>
        </div>
      </div>
      <div className="gc-safety-scoring">
        <span>10 points per correct answer</span>
        <span>Bonuses for streaks and long hauls</span>
      </div>
      <div className="gc-safety-foot">
        In the unlikely event of a wrong answer, oxygen masks will not deploy.
        <br />
        It&rsquo;s just a game.
      </div>
    </div>
  );
}
