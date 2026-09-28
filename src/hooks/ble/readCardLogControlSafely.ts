import type { IBLEAdapter } from '../../services/ble';
import type { CardLogControlStatus } from '../../types/ble';

export const readCardLogControlSafely = async (
  adapter: IBLEAdapter,
  updateStatus: (status: CardLogControlStatus | null) => void,
  updateSupported: (supported: boolean) => void,
): Promise<CardLogControlStatus | null> => {
  try {
    const status = await adapter.getCardLogControlStatus();
    updateStatus(status);
    updateSupported(status !== null);
    return status;
  } catch (error) {
    console.warn('カードログ制御ステータス取得失敗（接続は維持）:', error);
    updateStatus(null);
    updateSupported(false);
    return null;
  }
};
