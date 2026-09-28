// Test-only UI fixture. No production scan or sensor values are simulated.
import { IonApp, setupIonicReact } from '@ionic/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import BLEModal from '../../src/components/BLEModal';
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '../../src/theme/variables.css';
import '../../src/theme/control-tokens.css';
import '../../src/pages/Dashboard.css';

const params = new URLSearchParams(location.search);
const light = params.get('theme') !== 'dark';
setupIonicReact({ mode: params.get('mode') === 'md' ? 'md' : 'ios', animated: false });
document.addEventListener('ionModalDidPresent', () => { document.documentElement.dataset.blePresented = 'true'; });
const devices = Array.from({ length: 6 }, (_, index) => ({
  deviceId: `fixture-device-${index + 1}`, name: `ULSA EVO #${index < 2 ? 7 : index + 1}`,
  nodeId: index < 2 ? 7 : index + 1, rssi: -50 - index * 4,
}));

export const Harness = () => {
  const [open, setOpen] = useState(true);
  const [selected, setSelected] = useState('');
  const [rescans, setRescans] = useState(0);
  return <IonApp>
    <output data-testid="selected-device">{selected}</output>
    <output data-testid="rescans">{rescans}</output>
    <BLEModal isOpen={open} onDismiss={() => setOpen(false)} connectionState="disconnected" dataState="idle"
      connectedDevice={null} availableDevices={devices} error={null} isSupported
      platformInfo={{ platform: 'ios', adapterType: 'Capacitor', isSupported: true }}
      themeIsLight={light} themeGradient={light ? 'linear-gradient(150deg, #edf7f7, #d9e8ed)' : undefined}
      onScanAndConnect={() => setRescans((count) => count + 1)}
      onConnectToDevice={(device) => setSelected(device.deviceId)} onIdentifyDevice={() => undefined}
      onDisconnect={() => undefined} onClearError={() => undefined} />
  </IonApp>;
};

createRoot(document.getElementById('root')!).render(<Harness />);
