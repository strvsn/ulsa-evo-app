import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const readSource = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const listProductionTsx = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory())
        return listProductionTsx(path);
    return entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [path] : [];
});
describe('Phase 2 I44 control migration', () => {
    it('keeps every native production button non-submitting by default', () => {
        const violations = listProductionTsx('src').flatMap((path) => {
            const source = readSource(path);
            return Array.from(source.matchAll(/<button\b([\s\S]*?)>/g))
                .filter((match) => !/\btype\s*=/.test(match[1]))
                .map((match) => `${path}:${source.slice(0, match.index).split('\n').length}`);
        });
        expect(violations).toEqual([]);
    });
    it('keeps shared hit, focus, disabled, and reduced-motion contracts scoped to migrated controls', () => {
        const controlCss = readSource('src/components/controls/control.css');
        const tokens = readSource('src/theme/control-tokens.css');
        expect(tokens).toContain('--control-size-i44: 44px');
        expect(tokens).toContain('@media (prefers-reduced-motion: reduce)');
        expect(controlCss).toContain(".control-button[data-control-size='I44']");
        expect(controlCss).toContain('min-inline-size: var(--control-size-i44)');
        expect(controlCss).toContain('.control-button:focus-visible');
        expect(controlCss).toContain('.control-button:disabled');
        expect(controlCss).not.toMatch(/(^|\n)button\s*\{/);
    });
    it('migrates the approved Phase 2 I44 families without moving BLE or logging state into the primitive', () => {
        const dashboard = readSource('src/pages/Dashboard.tsx');
        const windRose = readSource('src/components/slides/WindRoseGaugeSlide.tsx');
        const metricCard = readSource('src/components/MetricCard.tsx');
        const derivedMetrics = readSource('src/components/derived-metrics/DerivedMetricControls.tsx');
        const bleModal = readSource('src/components/BLEModal.tsx');
        const drawer = readSource('src/components/BLESettingsDrawer.tsx');
        expect(dashboard).toMatch(/<ControlIconButton\s+className="settings-menu-button"/);
        expect(dashboard).toContain('className="carousel-nav prev"');
        expect(dashboard).toContain('className="carousel-nav next"');
        expect(windRose).toContain('wind-rose-compass-action');
        expect(windRose).toContain('wind-rose-pip-action');
        expect(metricCard).toContain('className="metric-card-remove"');
        expect(derivedMetrics).toContain('className="derived-metric-picker-close"');
        expect(bleModal).toContain('className="ble-modal-close"');
        expect(bleModal).toContain('className="ble-error-dismiss"');
        expect(bleModal).not.toMatch(/<IonButton[\s\S]{0,160}aria-label="接続エラーを閉じる"/);
        expect(drawer).toContain('className="ble-settings-close"');
    });
    it('extends the shared contract to drawer updates, destructive actions, and async saves', () => {
        const controlCss = readSource('src/components/controls/control.css');
        const controls = readSource('src/components/controls/controlTypes.ts');
        const ionicControls = readSource('src/components/controls/IonicControlButton.tsx');
        const time = readSource('src/components/ble-settings/TimePanel.tsx');
        const device = readSource('src/components/ble-settings/UserDevicePanel.tsx');
        const i2c = readSource('src/components/ble-settings/I2cPanel.tsx');
        const storage = readSource('src/components/ble-settings/StoragePanel.tsx');
        const browserLogStorage = readSource('src/components/ble-settings/BrowserLogStoragePanel.tsx');
        expect(controlCss).toContain("[data-control-size='C36']");
        expect(controlCss).toContain("[data-control-size='M44']");
        expect(controls).toContain('getControlOperationalState');
        expect(ionicControls).toContain("aria-busy={isBusy ? 'true' : undefined}");
        expect(time).toContain('controlSize="M44"');
        expect(device).toContain('controlSize="M44"');
        expect(device).toContain('props.onRefreshFirmwareVersions ?? props.onRefreshStm32FirmwareVersion');
        expect(device).toContain('props.onSetLedBrightness(brightness)');
        expect(i2c).toContain('controlSize="M44"');
        expect(storage).toContain('<BrowserLogStoragePanel');
        expect(browserLogStorage).toContain('data-testid="browser-log-download-selected"');
        expect(browserLogStorage).toContain('controlVariant="destructive"');
    });
    it('routes every product control through a shared primitive except the overlay dismiss surface', () => {
        const directIonicControls = listProductionTsx('src')
            .filter((path) => path !== 'src/components/controls/IonicControlButton.tsx')
            .flatMap((path) => {
            const source = readSource(path);
            return /<Ion(?:Button|SegmentButton)\b/.test(source) ? [path] : [];
        });
        const rawControls = listProductionTsx('src')
            .filter((path) => path !== 'src/components/controls/NativeControlButton.tsx')
            .flatMap((path) => {
            const source = readSource(path);
            const rawButtonCount = Array.from(source.matchAll(/<button\b/g)).length;
            const allowedBackdropCount = path === 'src/components/BLESettingsDrawer.tsx'
                ? Array.from(source.matchAll(/<button\b[\s\S]*?className="ble-settings-drawer-backdrop"/g)).length
                : 0;
            return rawButtonCount === allowedBackdropCount ? [] : [path];
        });
        expect(directIonicControls).toEqual([]);
        expect(rawControls).toEqual([]);
    });
    it('keeps remaining Ionic and drawer touch hosts at least 44px without overlay hitboxes', () => {
        const dashboardControls = readSource('src/pages/dashboard/dashboard-slides-metrics.css');
        const dashboardResponsive = readSource('src/pages/dashboard/dashboard-status-responsive.css');
        const drawerContainment = readSource('src/components/ble-settings/styles/drawer-content-containment.css');
        expect(dashboardControls).toMatch(/\.dashboard-content \.gauge-segment ion-segment-button\s*\{[\s\S]*?min-height:\s*44px;/);
        expect(dashboardControls).toMatch(/\.dashboard-content \.chart-segment ion-segment-button\s*\{[\s\S]*?min-height:\s*44px;/);
        expect(dashboardResponsive).toMatch(/\.time-scale-btn\s*\{[\s\S]*?min-width:\s*44px;/);
        expect(drawerContainment).toContain('.ble-settings-detail .ble-settings-action-button.ghost');
        expect(drawerContainment).toContain('.ble-settings-detail ion-button[size="small"]');
        expect(drawerContainment).toContain('.ble-settings-detail .ble-settings-advanced > summary');
        expect(drawerContainment).toContain('.ble-settings-detail .card-log-settings-controls ion-segment-button');
        expect(drawerContainment).toContain('.ble-settings-detail .card-log-auto-start-actions ion-toggle');
        expect(drawerContainment).toContain('.ble-settings-detail .led-wind-reactive-toggle');
        expect(drawerContainment).toContain('.ble-settings-detail .led-brightness-slider');
        expect(drawerContainment.match(/min-block-size:\s*var\(--control-size-m44, 44px\);/g)?.length)
            .toBeGreaterThanOrEqual(5);
        expect(drawerContainment).not.toMatch(/::(?:before|after)[\s\S]*?44px/);
    });
    it('does not erase intentional segment borders from the global Ionic reset', () => {
        const globalTheme = readSource('src/theme/variables.css');
        const borderReset = globalTheme.match(/\/\* Item、Toolbar、Contentの不要な境界線だけを無効化（カードとSegmentは除外） \*\/([\s\S]*?)\/\* 疑似要素/)?.[1] ?? '';
        expect(borderReset).not.toContain('ion-segment');
        expect(borderReset).not.toContain('ion-segment-button');
    });
    it('keeps settings theme rules isolated from the lazy-loaded BLE modal', () => {
        const drawerEntry = readSource('src/components/BLESettingsDrawer.css');
        const drawerTheme = readSource('src/components/ble-settings/styles/drawer-theme-responsive.css');
        expect(drawerEntry).toContain("@import './ble-settings/styles/drawer-theme-responsive.css';");
        expect(drawerEntry).not.toContain('legacy-modal-compat-theme-responsive.css');
        expect(drawerTheme).not.toContain('.ble-modal');
        expect(drawerTheme).not.toContain('.ble-identify-button');
        expect(drawerTheme).not.toContain('.ble-connect-section');
    });
});
