import { describe, expect, it } from 'vitest';
import { buildLineChartAccessibilitySummary, buildLineChartTooltipHtml } from './lineChartAccessibility';

describe('buildLineChartAccessibilitySummary', () => {
  it('describes an empty chart without inventing values', () => {
    expect(buildLineChartAccessibilitySummary({
      name: '風速', unit: ' m/s', timeScale: '1m', data: [],
    })).toBe('風速の1分間時系列グラフ。表示できるデータはありません。');
  });

  it('describes the latest, minimum, and maximum values', () => {
    expect(buildLineChartAccessibilitySummary({
      name: '風向', unit: '°', timeScale: '10s', data: [[1, 358], [2, 2], [3, 12]],
    })).toBe('風向の10秒間時系列グラフ。3点。最新値12°、最小値2°、最大値358°。');
  });

  it('formats tooltip values consistently with the visual chart', () => {
    expect(buildLineChartTooltipHtml({
      selectedChart: 'windSpeed',
      timestamps: ['12:00:00'],
      unit: ' m/s',
      params: [{
        dataIndex: 0,
        seriesName: '風速',
        value: [Date.UTC(2026, 0, 1, 3, 0, 0), 1.234],
      }],
    })).toContain('風速: 1.23 m/s');
  });
});
