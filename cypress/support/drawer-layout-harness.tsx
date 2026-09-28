import { setupIonicReact } from '@ionic/react';
import { createRoot } from 'react-dom/client';
import BLESettingsDrawer from '../../src/components/BLESettingsDrawer';
import { drawerLayoutFixtureProps } from './drawer-layout-fixture';
import { disconnectedUnsupportedDrawerProps } from './drawer-layout-scenarios';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '../../src/theme/variables.css';
import '../../src/theme/control-tokens.css';

const searchParams = new URLSearchParams(window.location.search);
const requestedMode = searchParams.get('mode');
const ionicMode = requestedMode === 'md' ? 'md' : 'ios';
const scenario = searchParams.get('scenario') === 'disconnected' ? 'disconnected' : 'connected';
const lightTheme = searchParams.get('theme') === 'light';
const firmwareRefresh = searchParams.get('firmwareRefresh');

setupIonicReact({ mode: ionicMode });

document.documentElement.style.width = '100%';
document.documentElement.style.height = '100%';
document.documentElement.style.overflow = 'hidden';
document.body.style.width = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
document.body.style.overflow = 'hidden';

const container = document.getElementById('root');
if (!container) throw new Error('drawer layout harness root is missing');
container.style.width = '100%';
container.style.height = '100%';
container.style.overflow = 'hidden';

const drawerProps = scenario === 'disconnected'
  ? disconnectedUnsupportedDrawerProps
  : drawerLayoutFixtureProps;

createRoot(container).render(<BLESettingsDrawer {...drawerProps} themeIsLight={lightTheme}
  firmwareInfoBusy={firmwareRefresh === 'busy'}
  firmwareInfoError={firmwareRefresh === 'error' ? 'ESP32のバージョンを取得できませんでした。BLE接続を確認し、もう一度お試しください。' : null} />);
document.documentElement.dataset.drawerLayoutHarness = 'ready';
document.documentElement.dataset.ionicMode = ionicMode;
document.documentElement.dataset.drawerScenario = scenario;
