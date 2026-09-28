import { describe, expect, it } from 'vitest';
import { completeStatus, readyStatus, writingStatus } from '../../../test-support/stm32-update-fixtures';
import { assertStm32PreparationStatus, stm32WriteProgress, Stm32UnexpectedCompletionError } from './stm32CompletionGuard';

describe('STM32 completion provenance', () => {
  it('rejects completed preparation rather than calling the selected firmware current', () => {
    expect(() => assertStm32PreparationStatus(completeStatus)).toThrow(Stm32UnexpectedCompletionError);
    expect(() => assertStm32PreparationStatus(readyStatus)).not.toThrow();
    expect(() => assertStm32PreparationStatus({ ...readyStatus, phase: 'recovery_required' })).not.toThrow();
  });

  it('does not reuse the package verification 100 percent as flash-write progress', () => {
    expect(readyStatus.progress).toBe(100);
    expect(stm32WriteProgress(readyStatus)).toBe(0);
    expect(stm32WriteProgress(writingStatus)).toBe(73);
    expect(stm32WriteProgress({ ...writingStatus, phase: 'verifying_flash', progress: 92 })).toBe(92);
    expect(stm32WriteProgress(completeStatus)).toBe(100);
    expect(stm32WriteProgress(null)).toBeUndefined();
    expect(stm32WriteProgress({ ...readyStatus, phase: 'recovery_required' })).toBeUndefined();
  });
});
