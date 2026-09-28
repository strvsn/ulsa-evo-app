import type { ChartScaleMode, ChartType } from '../../components/charts';

const CHART_SCALE_CYCLES: Record<ChartType, readonly ChartScaleMode[]> = {
  windSpeed: ['auto', 'fixed', 0.3, 5, 10],
  temperature: ['auto', 'fixed', 35, 45, 60],
  soundSpeed: ['auto', 'fixed', 360, 380, 400],
  windDirection: ['auto', 'fixed'],
};

export const getNextChartScaleMode = (
  chart: ChartType,
  current: ChartScaleMode,
): ChartScaleMode => {
  const cycle = CHART_SCALE_CYCLES[chart];
  const currentIndex = cycle.findIndex((mode) => mode === current);
  return cycle[currentIndex === -1 ? 0 : (currentIndex + 1) % cycle.length];
};
