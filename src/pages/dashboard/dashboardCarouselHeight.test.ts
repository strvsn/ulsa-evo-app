import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const carouselStyles = readFileSync(
  'src/pages/dashboard/dashboard-carousel-surface.css',
  'utf8',
);
const windRoseStyles = readFileSync(
  'src/components/slides/WindRoseGaugeSlide.css',
  'utf8',
);

describe('dashboard carousel content-aware height', () => {
  it('does not force every carousel card into one shared fixed height', () => {
    expect(carouselStyles).not.toContain('--carousel-card-height');
    expect(carouselStyles).toMatch(
      /\.gauge-card-main,\s*\.chart-card-slide\s*\{[\s\S]*?height:\s*auto;[\s\S]*?min-height:\s*0;/,
    );
    expect(carouselStyles).not.toMatch(
      /\.chart-container-slide\s*\{[\s\S]*?flex:\s*1 1 auto;/,
    );
  });

  it('preserves the radial gauge size while removing the expandable empty row', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-content\s*\{[\s\S]*?grid-template-rows:\s*auto auto;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-stage\s*\{[\s\S]*?height:\s*var\(--gauge-size\);[\s\S]*?min-height:\s*var\(--gauge-size\);/,
    );
  });

  it('reduces only radial-card chrome and HOLD height without shrinking the gauge', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-content\s*\{[\s\S]*?gap:\s*0\.25rem;[\s\S]*?padding:\s*0\.35rem 0\.65rem 0\.45rem;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-holds\s*\{[\s\S]*?padding:\s*0\.05rem 0\.2rem 0;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-capture\s*\{[\s\S]*?min-height:\s*54px;[\s\S]*?padding:\s*0\.24rem 0\.2rem 0\.22rem;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-stage\s*\{[\s\S]*?height:\s*var\(--gauge-size\);[\s\S]*?min-height:\s*var\(--gauge-size\);/,
    );
  });

  it('centers the compass-expanded canvas without asymmetric auto margins', () => {
    const stageRule = windRoseStyles.match(/\.wind-rose-stage\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(stageRule).toContain('justify-self: center');
    expect(stageRule).toMatch(/margin:\s*0;/);
    expect(stageRule).not.toMatch(/margin(?:-inline)?:\s*[^;]*auto/);
  });

  it('guards against transient rotated-layout collapse at the real radial content height', () => {
    expect(carouselStyles).toMatch(
      /\.main-swiper\s*\{[\s\S]*?min-height:\s*calc\(var\(--gauge-size\) \+ 3\.25rem\);/,
    );
  });

  it('keeps the peak-hold clear mark readable in dark and light themes', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-clear\s*\{[\s\S]*?color:\s*#f7fbfc;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-clear::before\s*\{[\s\S]*?border:\s*1px solid rgba\(247, 251, 252, 0\.64\);[\s\S]*?background:\s*rgba\(7, 19, 28, 0\.98\);/,
    );
    expect(windRoseStyles).toMatch(
      /\.dashboard-content\.light-theme \.wind-rose-peak-hold-clear\s*\{[\s\S]*?color:\s*#102a34;/,
    );
  });

  it('uses each theme peak-hold foreground instead of a fixed light value', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-slot\.active \.wind-rose-peak-hold-capture\s*\{[\s\S]*?color:\s*var\(--wind-rose-peak-active-text\);/,
    );
  });

  it('keeps saved HOLD colors opaque when GNSS temporarily disables recapture', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-slot\.active \.wind-rose-peak-hold-capture:disabled\s*\{[\s\S]*?opacity:\s*1;/,
    );
  });

  it('gives true-north HOLD labels a dedicated fitted row', () => {
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-slot\.has-reference \.wind-rose-peak-hold-capture\s*\{[\s\S]*?min-height:\s*64px;/,
    );
    expect(windRoseStyles).toMatch(
      /\.wind-rose-peak-hold-slot\.has-reference \.wind-rose-peak-hold-direction\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
  });
});
