import { useEffect, useState } from 'react';
import BaggageCarousel from './BaggageCarousel';
import './BootScreen.css';

const LOAD_MSGS = [
  'Loading global route data…',
  'Unloading 3,000+ airports onto the belt…',
  'Cross-checking carrier manifests…',
  'Screening liquids over 100 ml…',
  'Almost at the carousel…',
];

interface Props {
  status: 'loading' | 'error';
  message?: string;
  onRetry: () => void;
}

/**
 * Shown only while the bundled dataset is still fetching (rare — it's
 * prefetched at module load, see src/lib/dataset.ts) or if that fetch
 * fails. Reuses the design prototype's baggage-belt visual for the loading
 * state; not part of the normal "Start boarding" flow (decision 5 in the
 * implementation plan).
 */
export default function BootScreen({ status, message, onRetry }: Props) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (status !== 'loading') return;
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % LOAD_MSGS.length), 3000);
    return () => clearInterval(id);
  }, [status]);

  if (status === 'error') {
    return (
      <div className="gc-boot">
        <div className="card elev-sm" style={{ maxWidth: 340, textAlign: 'center', gap: 10 }}>
          <span className="card-kicker">DELAYED</span>
          <span className="card-title">Couldn't load route data</span>
          <p className="card-body">{message}</p>
          <button className="btn btn-primary" onClick={onRetry} style={{ minHeight: 44 }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gc-boot">
      <div className="gc-belt-card">
        <BaggageCarousel />
        <p className="gc-boot-msg">{LOAD_MSGS[msgIdx]}</p>
        <p className="gc-boot-subnote">Loading route data (one-time, cached after this)</p>
      </div>
    </div>
  );
}
