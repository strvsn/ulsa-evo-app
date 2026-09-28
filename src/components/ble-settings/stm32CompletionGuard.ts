import type { Stm32UpdateHttpStatus } from '../../services/ota/stm32OtaTransfer';

export class Stm32UnexpectedCompletionError extends Error {
  constructor() {
    super('本体に前回の更新完了状態が残っています。今回の書込みは開始していません。本体の電源を入れ直して、準備からやり直してください。');
    this.name = 'Stm32UnexpectedCompletionError';
  }
}

/** A preparation response cannot prove a write that we have not requested. */
export const assertStm32PreparationStatus = (status: Stm32UpdateHttpStatus): void => {
  if (status.phase === 'complete') throw new Stm32UnexpectedCompletionError();
};

export const stm32WriteProgress = (status: Stm32UpdateHttpStatus | null): number | undefined => {
  if (!status) return undefined;
  if (status.phase === 'ready_to_write') return 0;
  if (['writing', 'verifying_flash', 'restarting', 'complete'].includes(status.phase)) {
    return status.progress;
  }
  return undefined;
};
