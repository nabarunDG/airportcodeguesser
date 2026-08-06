import { useId, useMemo } from 'react';
import type { StampRecord } from '../types';
import { stampTilt, templateFor, wearDefs } from '../lib/stampTemplates';
import './PassportStamp.css';

interface Props {
  stamp: StampRecord;
  /** Rendered width in px. The dies are two aspect ratios, so height follows the viewBox. */
  width?: number;
  /** Plays the press-and-ink-bleed entrance. Off for stamps that are already on the page. */
  animate?: boolean;
  /** Staggers the entrance — used to land a page of stamps one after another. */
  delayMs?: number;
  className?: string;
}

/**
 * One passport stamp, inked by the die its continent maps to (see
 * src/lib/stampTemplates.ts). Colour comes from the two CSS custom properties
 * set here: an ancestor with `.gc-on-paper` selects the true ink, everything
 * else gets the lifted variant that survives the dark boarding pass.
 *
 * The die markup is injected rather than expressed as JSX because it's mostly
 * generated geometry — arc text, bead rings, scalloped edges. It is built
 * entirely from our own build-time dataset and every interpolated value is
 * escaped in stampTemplates.ts; nothing here is user input.
 */
export default function PassportStamp({ stamp, width, animate = false, delayMs = 0, className }: Props) {
  const reactId = useId();
  const die = templateFor(stamp.continent);

  const inner = useMemo(() => {
    // Ids must be unique per instance or textPaths and filters cross-wire
    // between stamps sharing a page.
    const uid = `s${reactId.replace(/[^a-zA-Z0-9]/g, '')}${stamp.iata}`;
    const filterId = `${uid}-w`;
    const maskId = `${uid}-m`;
    const body = die.draw(stamp.slots, {
      arcTop: `${uid}-at`,
      arcBottom: `${uid}-ab`,
      perimeter: `${uid}-p`,
    });
    return (
      `<defs>${wearDefs(filterId, maskId, stamp.iata)}</defs>` +
      `<g class="gc-stamp-ink" filter="url(#${filterId})" mask="url(#${maskId})">${body}</g>`
    );
  }, [die, reactId, stamp.iata, stamp.slots]);

  return (
    <svg
      className={['gc-stamp', animate ? 'gc-stamp-press' : '', className].filter(Boolean).join(' ')}
      viewBox={die.viewBox}
      width={width ?? die.width}
      role="img"
      aria-label={`${die.label} stamp: ${stamp.slots.city}, ${stamp.slots.country}, ${stamp.slots.date}`}
      style={
        {
          '--gc-tilt': `${stampTilt(stamp.iata)}deg`,
          '--gc-delay': `${delayMs}ms`,
          '--gc-ink-paper': die.ink.paper,
          '--gc-ink-dark': die.ink.dark,
        } as React.CSSProperties
      }
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
