import { setupIonicReact } from '@ionic/react';
import { createRoot } from 'react-dom/client';
import MetricsGrid from '../../src/components/MetricsGrid';
import {
  DERIVED_METRIC_IDS,
  DERIVED_METRIC_PREFERENCES_STORAGE_KEY,
} from '../../src/components/derived-metrics/derivedMetricPreferences';
import { ReferenceWindSpeedWindow } from '../../src/utils/derivedWindMetrics';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '../../src/theme/variables.css';
import '../../src/theme/control-tokens.css';
import '../../src/pages/Dashboard.css';

setupIonicReact({ mode: 'ios' });

const referenceWindSpeedWindow = new ReferenceWindSpeedWindow(64);
const now = Date.now();

for (let index = 0; index < 60; index += 1) {
  referenceWindSpeedWindow.push(0.5 + (index % 9) * 0.16, now - (59 - index) * 10_000);
}

window.localStorage.setItem(
  DERIVED_METRIC_PREFERENCES_STORAGE_KEY,
  JSON.stringify(DERIVED_METRIC_IDS),
);

const root = document.getElementById('root');
if (!root) throw new Error('metrics layout harness root is missing');

document.documentElement.style.margin = '0';
document.body.style.margin = '0';

createRoot(root).render(
  <main className="dashboard-content slate-theme" data-testid="metrics-layout-harness">
    <div className="dashboard-shell">
      <MetricsGrid
        windSpeed={0.08}
        windSpeedAverage10m={0.06}
        windSpeedUnit="m/s"
        windDirection={271}
        headingSpeed={0}
        temperature={25.1}
        soundSpeed={346.4}
        bufferRefs={{
          referenceWindSpeedWindowRef: { current: referenceWindSpeedWindow },
        }}
      />
    </div>
  </main>,
);

document.documentElement.dataset.metricsLayoutHarness = 'ready';
