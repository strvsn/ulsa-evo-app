// This Vite test entry is never included in the application build.
import { setupIonicReact, IonApp } from '@ionic/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FirmwareUpdateWizard, type FirmwareWizardStage } from '../../src/components/ble-settings/FirmwareUpdateWizard';
import { describeStm32WebConnectionFailure, STM32_MANUAL_WIFI_INSTRUCTION, STM32_MANUAL_WIFI_RETRY_INSTRUCTION } from '../../src/components/ble-settings/stm32UpdatePanelHelpers';
import type { OtaConnectionPhase } from '../../src/components/ble-settings/otaPanelHelpers';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '../../src/theme/variables.css';
import '../../src/theme/control-tokens.css';
// Include the real settings cascade to catch cross-component style collisions.
import '../../src/components/BLESettingsDrawer.css';

// These tests measure layout and controls, not the modal entrance animation.
// Headless CI can throttle its animation frames past the readiness timeout.
// Keep product cues and progress-ring animations, but make modal presentation deterministic.
setupIonicReact({ mode: 'ios', animated: false });
document.addEventListener('ionModalDidPresent', () => { document.documentElement.dataset.otaPresented = 'true'; });
const params = new URLSearchParams(location.search);
const preview = params.get('stage') === 'buttonPreview';
const stage = (preview ? 'button' : params.get('stage') || 'ready') as FirmwareWizardStage;
const target = params.get('target') === 'STM32' ? 'STM32' : 'ESP32';
const busy = ['download', 'button', 'connection', 'checking', 'updating'].includes(stage);
const connectionPhase = (params.get('phase') ?? undefined) as OtaConnectionPhase | undefined;
const remainingSeconds = params.has('remaining') ? Number(params.get('remaining')) : null;
const light = params.get('theme') !== 'dark';
const webRetry = params.get('webRetry') === 'true';
document.documentElement.style.setProperty('--ion-text-color', light ? '#152c36' : '#f4f8fb');
document.documentElement.style.setProperty('--ion-background-color', light ? '#f1f5f6' : '#071019');
document.body.style.background = light ? '#d9e3e7' : '#071019';
export const Harness = () => {
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return <IonApp><FirmwareUpdateWizard isOpen={open} target={target} version="v1.0.0 · r2 / 最新"
    stage={stage} busy={busy} buttonReady={!preview}
    connectionPhase={connectionPhase} connectionRemainingSeconds={remainingSeconds}
    autoJoinAvailable={params.get('autoJoin') === 'true'}
    description={target === 'STM32' ? webRetry ? STM32_MANUAL_WIFI_RETRY_INSTRUCTION
      : stage === 'manualWifi' ? STM32_MANUAL_WIFI_INSTRUCTION : undefined : undefined}
    primaryAction={{ label: stage === 'complete' ? '閉じる' : stage === 'error' ? '更新状態を確認' : stage === 'manualWifi' ? '接続を確認' : '更新を開始', run: stage === 'complete' ? close : () => undefined }}
    onDismiss={close} progress={params.has('progress') ? Number(params.get('progress')) : stage === 'updating' ? 42 : undefined}
    manualSession={{ ssid: 'ULSA-EVO-OTA-A1B', password: 'example-password', token: 'test-only', ip: '192.168.4.1' }}
    error={stage === 'error' ? webRetry
      ? describeStm32WebConnectionFailure(null, 'ULSA-EVO-OTA-A1B', 'denied')
      : '本体からの応答が途切れました。更新が続いている可能性があります。電源を切らずに、更新状態を確認してください。' : undefined} />
  </IonApp>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
