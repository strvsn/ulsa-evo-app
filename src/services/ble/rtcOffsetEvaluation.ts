export type RtcOffsetAssessment = 'single' | 'withinSecondPrecision' | 'stable';

export interface RtcOffsetEvaluation {
  offsetMs: number | null;
  assessment: RtcOffsetAssessment;
  sampleCount: number;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const evaluateRtcOffsetSamples = (
  samples: Array<number | null>,
): RtcOffsetEvaluation => {
  const valid = samples.filter((value): value is number => (
    value !== null && Number.isFinite(value)
  ));
  if (valid.length === 0) {
    return { offsetMs: null, assessment: 'single', sampleCount: 0 };
  }

  const representative = median(valid);
  if (valid.length < 2) {
    return { offsetMs: representative, assessment: 'single', sampleCount: valid.length };
  }

  const persistentlyAhead = valid.every((value) => value >= 1000);
  const persistentlyBehind = valid.every((value) => value <= -1000);
  return {
    offsetMs: representative,
    assessment: persistentlyAhead || persistentlyBehind ? 'stable' : 'withinSecondPrecision',
    sampleCount: valid.length,
  };
};
