import type { WindowedChartData } from './lineChartData';

type WindowedSeries = {
  key: string;
  name: string;
  color: string;
  visible: boolean;
  windowedData: WindowedChartData;
};

export const buildWindSpeedChartSeries = (
  seriesList: WindowedSeries[],
  baseSeriesOption: object
) => seriesList
  .filter((series) => series.visible && (series.key === 'windSpeed' || series.windowedData.data.length > 0))
  .map((series) => series.key === 'windSpeed'
    ? {
      ...baseSeriesOption,
      yAxisIndex: 0,
      data: series.windowedData.data,
    }
    : {
      name: series.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      sampling: 'lttb',
      yAxisIndex: 0,
      lineStyle: { color: series.color, width: 1.8 },
      data: series.windowedData.data,
    });

export const buildTemperatureChartSeries = (
  seriesList: WindowedSeries[],
  baseSeriesOption: object
) => seriesList
  .filter((series) => series.visible)
  .map((series) => series.key === 'temperature'
    ? {
      ...baseSeriesOption,
      yAxisIndex: 0,
      data: series.windowedData.data,
    }
    : {
      name: series.name,
      type: 'line',
      smooth: true,
      symbol: 'none',
      sampling: 'lttb',
      yAxisIndex: 0,
      connectNulls: false,
      lineStyle: { color: series.color, width: 1.8, type: 'dashed' },
      data: series.windowedData.data,
    });
