import { createRoot } from 'react-dom/client';
import { LogRecordingCard } from '../../src/components/LogRecordingCard';
import type { LogRecordingDestinationStatus } from '../../src/hooks/logging/logRecordingVisuals';

import '../../src/theme/variables.css';
import '../../src/theme/control-tokens.css';
import '../../src/pages/Dashboard.css';

const scenario = new URLSearchParams(window.location.search).get('scenario');
const lightTheme = new URLSearchParams(window.location.search).get('theme') === 'light';
const cardRecording = scenario === 'card' || scenario === 'dual';
const appRecording = scenario === 'browser' || scenario === 'dual';
const cardUnavailable = scenario === 'unavailable';
const destinations: LogRecordingDestinationStatus[] = [
  { destination: 'card', selected: cardRecording || cardUnavailable,
    state: cardRecording ? 'recording' : 'disabled' },
  { destination: 'browser', selected: appRecording,
    state: appRecording ? 'recording' : 'disabled' },
];
const container = document.getElementById('root');
if (!container) throw new Error('log recording harness root is missing');

createRoot(container).render(
  <div className={`dashboard-content ${lightTheme ? 'light-theme' : ''}`}>
    <LogRecordingCard
      active={cardRecording || appRecording}
      disabled={cardUnavailable}
      hasError={false}
      modeLabel={scenario ?? 'none'}
      elapsedLabel="123:45:56"
      actionTitle={cardUnavailable ? 'カードが検出されていません' : 'ログ記録を停止'}
      destinations={destinations}
      canChangeDestinations={false}
      onToggleDestination={() => undefined}
      onToggle={() => undefined}
    />
  </div>,
);
