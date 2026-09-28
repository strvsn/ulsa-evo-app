import { describe, expect, it } from 'vitest';
import { evaluateRtcOffsetSamples } from './rtcOffsetEvaluation';

describe('evaluateRtcOffsetSamples', () => {
  it('treats a zero/one-second boundary mixture as second-level agreement', () => {
    expect(evaluateRtcOffsetSamples([0, -1000, 0])).toEqual({
      offsetMs: 0,
      assessment: 'withinSecondPrecision',
      sampleCount: 3,
    });
  });

  it('reports a persistent one-second delay only after repeated confirmation', () => {
    expect(evaluateRtcOffsetSamples([-1000, -1000, -1000])).toEqual({
      offsetMs: -1000,
      assessment: 'stable',
      sampleCount: 3,
    });
  });

  it('uses the median for a persistent larger offset', () => {
    expect(evaluateRtcOffsetSamples([-2000, -1000, -1000])).toEqual({
      offsetMs: -1000,
      assessment: 'stable',
      sampleCount: 3,
    });
  });
});
