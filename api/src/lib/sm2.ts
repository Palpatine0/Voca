/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Quality grades:
 *   0 — complete blackout
 *   1 — incorrect but remembered upon seeing answer
 *   2 — incorrect but answer felt easy to recall
 *   3 — correct with serious difficulty
 *   4 — correct with some hesitation
 *   5 — perfect recall
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 */

export interface SM2Input {
  quality: number; // 0-5
  easinessFactor: number;
  interval: number; // days
  repetitions: number;
}

export interface SM2Output {
  easinessFactor: number;
  interval: number; // days
  repetitions: number;
}

const MIN_EF = 1.3;

export function sm2(input: SM2Input): SM2Output {
  const { quality, easinessFactor, interval, repetitions } = input;

  const q = Math.max(0, Math.min(5, Math.round(quality)));

  // If recall quality < 3, reset repetitions (card is "lapsed")
  if (q < 3) {
    return {
      easinessFactor: Math.max(
        MIN_EF,
        easinessFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
      ),
      interval: 1,
      repetitions: 0,
    };
  }

  // Successful recall: advance interval
  let newInterval: number;
  const newReps = repetitions + 1;

  if (repetitions === 0) {
    newInterval = 1;
  } else if (repetitions === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(interval * easinessFactor);
  }

  const newEF = Math.max(
    MIN_EF,
    easinessFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  return {
    easinessFactor: newEF,
    interval: newInterval,
    repetitions: newReps,
  };
}
