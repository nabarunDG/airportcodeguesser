import SplitFlapLogo from './SplitFlapLogo';
import './Header.css';

interface Props {
  inPlay: boolean;
  roundNo: number;
  score: number;
  onGoHome: () => void;
}

export default function Header({ inPlay, roundNo, score, onGoHome }: Props) {
  return (
    <div className="gc-header">
      <button className="gc-header-brand" onClick={onGoHome} type="button">
        <SplitFlapLogo />
        <span className="gc-header-word">
          GATE<span className="gc-accent">CHECK</span>
        </span>
      </button>
      {inPlay && (
        <div className="gc-header-status">
          <span>
            RD <span className="gc-val">{roundNo}</span>/10
          </span>
          <span className="gc-sep">|</span>
          <span>
            PTS <span className="gc-val gc-val--accent">{score}</span>
          </span>
        </div>
      )}
    </div>
  );
}
