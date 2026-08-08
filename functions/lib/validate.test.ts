// Regression coverage for the score-submission cap. It used to be a flat 100
// — right when the only points were 10 per round — and was never updated
// when streak upgrades, continent/date-line/long-haul bonuses and FF's elite
// bonus shipped, pushing the real ceiling to 165 (GB) / 215 (FF). The stale
// cap silently rejected every real submission above 100: the client's
// auto-post effect (src/hooks/useGameEngine.ts) shows no error on a failed
// post, so a strong batch from ANY home airport just vanished from the board
// with nothing on screen to explain why.
import { describe, expect, it } from 'vitest';
import { maxScore } from '../../src/lib/gameLogic';
import { validateSubmission } from './validate';

const VALID_IATA = new Set(['RDU', 'PWM']);

describe('validateSubmission score ceiling', () => {
  it('accepts a score above the old flat-100 cap', () => {
    // A perfect FF batch reaches 215 with every bonus banked — see
    // src/lib/gameLogic.test.ts's "long-haul bonus" / maxScore assertions.
    const result = validateSubmission({ airport: 'PWM', playerId: 'p1', score: 205 }, VALID_IATA);
    expect(result.ok).toBe(true);
  });

  it('still rejects a score beyond what any mode can actually earn', () => {
    const impossible = Math.max(maxScore('gb'), maxScore('ff')) + 1;
    const result = validateSubmission({ airport: 'PWM', playerId: 'p1', score: impossible }, VALID_IATA);
    expect(result.ok).toBe(false);
  });

  it('accepts the exact ceiling for each mode', () => {
    expect(validateSubmission({ airport: 'RDU', playerId: 'p1', score: maxScore('gb') }, VALID_IATA).ok).toBe(true);
    expect(validateSubmission({ airport: 'RDU', playerId: 'p1', score: maxScore('ff') }, VALID_IATA).ok).toBe(true);
  });

  it('rejects a negative or non-integer score regardless of the cap', () => {
    expect(validateSubmission({ airport: 'RDU', playerId: 'p1', score: -1 }, VALID_IATA).ok).toBe(false);
    expect(validateSubmission({ airport: 'RDU', playerId: 'p1', score: 12.5 }, VALID_IATA).ok).toBe(false);
  });

  it('still validates the airport code independently of the score fix', () => {
    const result = validateSubmission({ airport: 'ZZZ', playerId: 'p1', score: 50 }, VALID_IATA);
    expect(result.ok).toBe(false);
  });
});
