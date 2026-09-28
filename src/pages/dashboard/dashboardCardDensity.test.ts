import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const visualRefreshStyles = readFileSync('src/pages/dashboard/dashboard-visual-refresh.css', 'utf8');
const segmentControlStyles = readFileSync('src/pages/dashboard/dashboard-segment-controls.css', 'utf8');
const metricsLayoutStyles = readFileSync('src/pages/dashboard/dashboard-metrics-layout.css', 'utf8');
const logRecordingStyles = readFileSync('src/pages/dashboard/dashboard-log-recording-status.css', 'utf8');
const slideMetricStyles = readFileSync('src/pages/dashboard/dashboard-slides-metrics.css', 'utf8');
const metricsGridSource = readFileSync('src/components/MetricsGrid.tsx', 'utf8');
const appShell = readFileSync('index.html', 'utf8');
const contrastRatio = (foreground: string, background: string): number => {
    const luminance = (hex: string) => {
        const channels = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
        const linear = channels.map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
};
describe('dashboard top card density', () => {
    it('keeps carousel navigation centered while pressed and avoids all-property transitions', () => {
        const carouselRule = slideMetricStyles.match(/\.carousel-nav\s*\{([\s\S]*?)\}/)?.[1] ?? '';
        expect(carouselRule).not.toContain('transition: all');
        expect(carouselRule).toContain('transition: background-color 0.16s ease');
        expect(slideMetricStyles).toMatch(/\.carousel-nav\.control-button:active:not\(:disabled\)\s*\{[\s\S]*?transform:\s*translateY\(-50%\);[\s\S]*?filter:\s*brightness\(0\.94\);/);
        expect(visualRefreshStyles).toMatch(/\.carousel-wrapper\.chart-slide-active \.carousel-nav\.prev\.control-button:active:not\(:disabled\)\s*\{[\s\S]*?transform:\s*none;/);
    });
    it('keeps the settings menu trigger frameless while preserving its hit target', () => {
        expect(visualRefreshStyles).toMatch(/\.settings-menu-button,\s*\.flip-button,\s*\.card-log-button\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
        expect(visualRefreshStyles).toMatch(/\.settings-menu-button\s*\{[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;[\s\S]*?backdrop-filter:\s*none;/);
        expect(visualRefreshStyles).toMatch(/\.settings-menu-button :is\(ion-icon, \.ulsa-icon\)\s*\{[\s\S]*?width:\s*28px;[\s\S]*?height:\s*28px;/);
        expect(visualRefreshStyles).toMatch(/\.dashboard-content\.light-theme \.settings-menu-button,[\s\S]*?border:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
    });
    it('keeps the BLE status card compact at phone widths', () => {
        expect(visualRefreshStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.status-content\s*\{[\s\S]*?min-height:\s*56px;[\s\S]*?padding:\s*0\.55rem 0\.8rem;/);
        expect(visualRefreshStyles).toMatch(/\.status-badge\s*\{[\s\S]*?min-block-size:\s*var\(--control-visual-action, 40px\);[\s\S]*?border:\s*1px solid transparent;/);
    });
    it('moves sensor status into the BLE card and equalizes top-card spacing', () => {
        expect(metricsGridSource).not.toContain('data-source-badge');
        expect(slideMetricStyles).not.toContain('.data-source-badge');
        expect(visualRefreshStyles).not.toContain('.data-source-badge');
        expect(visualRefreshStyles).toMatch(/--dashboard-card-gap:\s*0\.65rem;/);
        expect(visualRefreshStyles).toMatch(/\.status-card\s*\{[\s\S]*?margin:\s*0 auto var\(--dashboard-card-gap\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card\s*\{[\s\S]*?margin:\s*0 auto var\(--dashboard-card-gap\);/);
        expect(logRecordingStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.log-recording-card\s*\{[\s\S]*?margin-bottom:\s*var\(--dashboard-card-gap\);/);
        expect(visualRefreshStyles).toMatch(/\.carousel-wrapper\s*\{[\s\S]*?padding-top:\s*0;/);
        expect(visualRefreshStyles).toMatch(/\.carousel-pagination\s*\{[\s\S]*?position:\s*relative\s*!important;[\s\S]*?inset:\s*auto\s*!important;[\s\S]*?padding:\s*0\.35rem 0 0\.4rem;/);
    });
    it('uses one theme-aware surface for BLE, log, carousel, and information cards', () => {
        expect(visualRefreshStyles).toMatch(/--instrument-card-surface:\s*[\s\S]*?var\(--instrument-bg\);/);
        expect(visualRefreshStyles).toMatch(/\.status-card\s*\{[\s\S]*?background:\s*var\(--instrument-card-surface\);/);
        expect(visualRefreshStyles).toMatch(/\.gauge-card-main,\s*\.chart-card-slide\s*\{[\s\S]*?background:\s*var\(--instrument-card-surface\);/);
        expect(visualRefreshStyles).toMatch(/\.metric-card\s*\{[\s\S]*?background:\s*var\(--instrument-card-surface\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card\s*\{[\s\S]*?background:\s*var\(--instrument-card-surface\);/);
    });
    it('keeps every information and debug card on one shared grid track', () => {
        expect(visualRefreshStyles).not.toMatch(/\.sound-speed-card\s*\{[^}]*grid-column:/);
        expect(metricsLayoutStyles).toMatch(/@media \(max-width: 900px\)[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
        expect(metricsLayoutStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    });
    it('reserves stable tabular slots for changing information-card values', () => {
        expect(visualRefreshStyles).toMatch(/\.metric-card-uniform-type\s*\{[\s\S]*?--metric-number-slot:\s*5\.5ch;/);
        expect(visualRefreshStyles).toMatch(/\.wind-direction-card\s*\{[\s\S]*?--metric-number-slot:\s*3\.5ch;/);
        expect(visualRefreshStyles).toMatch(/\.heading-speed-card\s*\{[\s\S]*?--metric-number-slot:\s*6\.35ch;/);
        expect(visualRefreshStyles).toMatch(/\.metric-number,\s*\.metric-empty\s*\{[\s\S]*?flex:\s*0 0 var\(--metric-number-slot\);[\s\S]*?inline-size:\s*var\(--metric-number-slot\);[\s\S]*?min-inline-size:\s*var\(--metric-number-slot\);[\s\S]*?text-align:\s*right;[\s\S]*?font-variant-numeric:\s*tabular-nums lining-nums;/);
        expect(visualRefreshStyles).toMatch(/\.metric-value,[\s\S]*?\.metric-card-secondary \.metric-value\s*\{[\s\S]*?inline-size:\s*100%;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?padding-inline-end:\s*var\(--metric-value-end-padding\);/);
        expect(visualRefreshStyles).toMatch(/\.metric-unit,[\s\S]*?\.metric-card-secondary \.metric-unit\s*\{[\s\S]*?flex:\s*0 0 auto;/);
    });
    it('keeps the log controls readable and fully tappable at phone widths', () => {
        expect(logRecordingStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.log-recording-card\s*\{[\s\S]*?--log-recording-card-min-height:\s*104px;/);
        expect(logRecordingStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.log-recording-card-content\s*\{[\s\S]*?padding:\s*0\.25rem 0\.8rem;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destinations\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?flex-direction:\s*row;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination\s*\{[\s\S]*?min-height:\s*44px;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-action\s*\{[\s\S]*?min-height:\s*44px;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*4\.4rem;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination::before\s*\{[\s\S]*?inset:\s*4px 0;[\s\S]*?pointer-events:\s*none;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-action::before\s*\{[\s\S]*?inset:\s*2px 0;[\s\S]*?pointer-events:\s*none;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination-label\s*\{[\s\S]*?font-size:\s*0\.72rem;/);
        expect(logRecordingStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?grid-template-areas:[\s\S]*?"identity elapsed action"[\s\S]*?"destinations destinations destinations";/);
        expect(logRecordingStyles).toMatch(/@media \(max-width: 560px\)[\s\S]*?\.log-recording-card-destination\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?flex:\s*1 1 0;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-identity\s*\{[\s\S]*?grid-template-columns:\s*1\.32rem max-content;[\s\S]*?column-gap:\s*0\.55rem;/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-title\s*\{[\s\S]*?font-size:\s*0\.9rem;[\s\S]*?line-height:\s*1\.2;/);
    });
    it('uses a regular 50/50 fade for an active log card', () => {
        expect(logRecordingStyles).toMatch(/\.log-recording-card\.is-active\s*\{[\s\S]*?animation:\s*log-recording-card-fade 3s ease-in-out infinite;/);
        expect(logRecordingStyles).toMatch(/@keyframes log-recording-card-fade\s*\{[\s\S]*?0%,\s*100%\s*\{[\s\S]*?50%\s*\{/);
        expect(logRecordingStyles).not.toContain('log-recording-card-glow');
        expect(logRecordingStyles).not.toContain('log-recording-pulse-');
    });
    it('uses restrained state borders and crosses out disabled destination icons', () => {
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination::before\s*\{[\s\S]*?border:\s*1px solid var\(--log-destination-border, var\(--control-neutral-border\)\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination-disabled-mark\s*\{[\s\S]*?transform:\s*translate\(-50%, -50%\) rotate\(-48deg\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination\.is-ready\s*\{[\s\S]*?color:\s*var\(--instrument-live\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination\.is-recording\s*\{[\s\S]*?color:\s*var\(--control-recording-text\);/);
        expect(logRecordingStyles).toMatch(/\.log-recording-card-destination\.is-error\s*\{[\s\S]*?color:\s*var\(--control-pending-text\);/);
    });
    it('uses readable semantic status colors in the light theme', () => {
        expect(visualRefreshStyles).toMatch(/\.dashboard-content\.light-theme\s*\{[\s\S]*?--instrument-accent:\s*#006d69;[\s\S]*?--instrument-live:\s*#137a4a;[\s\S]*?--instrument-waiting:\s*#805000;[\s\S]*?--instrument-error:\s*#b42318;/);
    });
    it('uses filled iOS and Material tabs above normal-text contrast', () => {
        expect(segmentControlStyles).toContain('ion-segment-button:is(.ios, .md).control-button');
        expect(segmentControlStyles).toMatch(/ion-segment-button\.md\s*\{[\s\S]*?--indicator-height:\s*calc\(100% - 4px\);/);
        for (const [foreground, background] of [
            ['#14383d', '#d3e6e8'],
            ['#f4fbfb', '#174c52'],
            ['#405f6b', '#eef3f4']
        ] as const) {
            expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
        }
    });
    it('lets the selected theme own the document background without an important fallback', () => {
        expect(appShell).toContain('background: var(--app-background, #071019);');
        expect(appShell).not.toContain('background: #071019 !important;');
    });
});
