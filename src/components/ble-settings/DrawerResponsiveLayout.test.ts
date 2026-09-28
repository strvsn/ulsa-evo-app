import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const layoutStyles = readFileSync('src/components/ble-settings/styles/drawer-layout.css', 'utf8');
const entryStyles = readFileSync('src/components/BLESettingsDrawer.css', 'utf8');
const visualStyles = readFileSync('src/components/ble-settings/styles/drawer-visual-refresh.css', 'utf8');
const ledWindReactiveStyles = readFileSync('src/components/ble-settings/styles/led-wind-reactive-theme-selector.css', 'utf8');
const contentContainmentStyles = readFileSync('src/components/ble-settings/styles/drawer-content-containment.css', 'utf8');
const statusSummaryStyles = readFileSync('src/components/ble-settings/styles/drawer-status-summary.css', 'utf8');
const logSettingsStyles = readFileSync('src/components/ble-settings/styles/drawer-log-settings.css', 'utf8');
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
describe('settings drawer responsive layout', () => {
    it('owns the narrow-screen split layout in the structural stylesheet', () => {
        expect(layoutStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.ble-settings-drawer-panel\s*\{[\s\S]*?width:\s*100vw;/);
        expect(layoutStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.ble-settings-layout\s*\{[\s\S]*?grid-template-columns:\s*clamp\(108px, 30vw, 144px\) minmax\(0, 1fr\);/);
        expect(layoutStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.ble-settings-nav\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
        expect(visualStyles).not.toMatch(/\.ble-settings-layout\s*\{/);
        expect(visualStyles).not.toMatch(/\.ble-settings-drawer-panel\s*\{[^}]*\bwidth\s*:/);
    });
    it('keeps the panel bounded by the dynamic viewport with independent scrollers', () => {
        expect(layoutStyles).toMatch(/\.ble-settings-drawer-panel\s*\{[\s\S]*?height:\s*100%;[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*0;[\s\S]*?max-height:\s*100dvh;/);
        expect(layoutStyles).toMatch(/\.ble-settings-layout\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
        expect(layoutStyles).toMatch(/\.ble-settings-detail\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?overflow-x:\s*hidden;/);
    });
    it('preserves right and bottom safe areas in the last-applied mobile rule', () => {
        expect(visualStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.ble-settings-detail\s*\{[\s\S]*?safe-area-inset-right[\s\S]*?safe-area-inset-bottom/);
        expect(visualStyles).not.toMatch(/@media \(max-width: 700px\)[\s\S]*?\.ble-settings-nav-item\.active\s*\{[\s\S]*?inset 0 -3px 0/);
    });
    it('wraps all five LED themes into a three-column phone grid', () => {
        expect(ledWindReactiveStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.led-wind-reactive-theme-selector\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
        expect(ledWindReactiveStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.led-wind-reactive-toggle-row\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
        expect(ledWindReactiveStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.led-wind-reactive-theme-option\s*\{[\s\S]*?width:\s*100%;/);
        for (const viewportWidth of [320, 375, 390, 393, 430, 480]) {
            const navWidth = viewportWidth <= 360
                ? 96
                : clamp(viewportWidth * 0.3, 108, 144);
            const detailPadding = 24;
            const cardBorderAndPadding = 28;
            const themeGap = 12;
            const availableThemeWidth = viewportWidth - navWidth - detailPadding - cardBorderAndPadding;
            const themeColumnWidth = (availableThemeWidth - themeGap) / 3;
            expect(themeColumnWidth, `${viewportWidth}px viewport`).toBeGreaterThanOrEqual(34);
        }
    });
    it('constrains every settings panel control to the actual right-pane width', () => {
        expect(contentContainmentStyles).toMatch(/\.ble-settings-detail :where\([\s\S]*?\.ble-settings-card[\s\S]*?\.ota-flow[\s\S]*?\.card-log-settings-controls[\s\S]*?\.i2c-config-list[\s\S]*?\.led-wind-reactive-control[\s\S]*?\)\s*\{[\s\S]*?min-inline-size:\s*0;[\s\S]*?max-inline-size:\s*100%;/);
        expect(contentContainmentStyles).toMatch(/\.ble-settings-detail :where\([\s\S]*?ion-item[\s\S]*?ion-input[\s\S]*?ion-select[\s\S]*?ion-segment[\s\S]*?\)\s*\{[\s\S]*?min-inline-size:\s*0;[\s\S]*?max-inline-size:\s*100%;/);
        expect(contentContainmentStyles).toMatch(/overflow-wrap:\s*anywhere;/);
        expect(contentContainmentStyles).toMatch(/\.ble-settings-message > span\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 auto;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?word-break:\s*break-word;/);
    });
    it('stacks vulnerable phone controls and gives the right pane more room at 320px', () => {
        expect(contentContainmentStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.card-log-auto-start-control\s*\{[\s\S]*?flex-wrap:\s*wrap;/);
        expect(contentContainmentStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.card-log-auto-start-actions\s*\{[\s\S]*?padding-inline-end:\s*16px;/);
        expect(contentContainmentStyles).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.card-log-settings-controls ion-segment-button\s*\{[\s\S]*?min-inline-size:\s*0;/);
        expect(layoutStyles).toMatch(/@media \(max-width: 360px\)[\s\S]*?\.ble-settings-layout\s*\{[\s\S]*?grid-template-columns:\s*96px minmax\(0, 1fr\);/);
        expect(contentContainmentStyles).toMatch(/@media \(max-width: 420px\)[\s\S]*?\.ble-settings-card-header,[\s\S]*?\.ble-settings-info-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/);
    });
    it('loads the containment contract after every visual override', () => {
        const visualImport = entryStyles.indexOf("drawer-visual-refresh.css");
        const containmentImport = entryStyles.indexOf("drawer-content-containment.css");
        expect(visualImport).toBeGreaterThanOrEqual(0);
        expect(containmentImport).toBeGreaterThan(visualImport);
    });
    it('does not re-import modal CSS into the lazy settings chunk', () => {
        expect(entryStyles).not.toContain('ble-modal/styles/modal-core.css');
        expect(entryStyles).toContain('ble-settings/styles/drawer-log-settings.css');
        expect(logSettingsStyles).toContain('.ble-settings-drawer .card-log-settings-header');
        expect(logSettingsStyles).not.toMatch(/(^|\n)\.ble-modal\b/);
    });
    it('uses neutral inline status summaries instead of colorful Ionic badges', () => {
        const panelSources = [
            'OverviewPanel.tsx',
            'TimePanel.tsx',
            'DevicePanel.tsx',
            'I2cPanel.tsx',
            'StoragePanel.tsx',
            'Stm32UpdatePanelChrome.tsx'
        ].map((filename) => readFileSync(`src/components/ble-settings/${filename}`, 'utf8'));
        for (const source of panelSources) {
            expect(source).not.toMatch(/\bIon(?:Badge|Chip)\b|<ion-(?:badge|chip)|\bBadgeRow\b/);
        }
        expect(entryStyles).toContain('ble-settings/styles/drawer-status-summary.css');
        expect(statusSummaryStyles).toMatch(/\.ble-settings-status-summary\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-wrap:\s*wrap;/);
        expect(statusSummaryStyles).toMatch(/\.ble-settings-status-item\s*\{[\s\S]*?color:\s*inherit;[\s\S]*?font-weight:\s*650;/);
        expect(statusSummaryStyles).not.toMatch(/\.ble-settings-status-item\s*\{[^}]*\bbackground(?:-color)?\s*:/);
        expect(statusSummaryStyles).not.toMatch(/\.ble-settings-status-item\s*\{[^}]*\bborder(?:-radius)?\s*:/);
    });
});
