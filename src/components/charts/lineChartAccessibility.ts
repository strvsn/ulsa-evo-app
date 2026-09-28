const TIME_SCALE_LABELS = {
  '10s': '10秒間',
  '1m': '1分間',
  '10m': '10分間',
} as const;

type LineChartAccessibilitySummaryInput = {
  name: string;
  unit: string;
  timeScale: keyof typeof TIME_SCALE_LABELS;
  data: Array<[number, number]>;
};

const formatValue = (value: number, unit: string): string => {
  const decimals = unit.trim() === '°' ? 0 : value >= 100 ? 1 : 2;
  return `${value.toFixed(decimals)}${unit}`;
};

export const buildLineChartAccessibilitySummary = ({
  name,
  unit,
  timeScale,
  data,
}: LineChartAccessibilitySummaryInput): string => {
  const values = data.map((point) => point[1]).filter(Number.isFinite);
  const prefix = `${name}の${TIME_SCALE_LABELS[timeScale]}時系列グラフ。`;
  if (values.length === 0) return `${prefix}表示できるデータはありません。`;

  const latest = values.at(-1) ?? values[0];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return `${prefix}${values.length}点。最新値${formatValue(latest, unit)}、最小値${formatValue(minimum, unit)}、最大値${formatValue(maximum, unit)}。`;
};

type LineChartTooltipInput = {
  params: TooltipParam[];
  selectedChart: 'windSpeed' | 'windDirection' | 'temperature' | 'soundSpeed';
  timestamps: string[];
  unit: string;
};

export const buildLineChartTooltipHtml = ({
  params,
  selectedChart,
  timestamps,
  unit,
}: LineChartTooltipInput): string => {
  const firstParam = params[0];
  if (!firstParam) return '';
  const timestampMs = Array.isArray(firstParam.value) ? firstParam.value[0] : undefined;
  const originalTime = typeof timestampMs === 'number' && Number.isFinite(timestampMs)
    ? formatXAxisTimestampMs(timestampMs)
    : timestamps[firstParam.dataIndex] || '';
  const lines = params.map((param) => {
    const value = getTooltipValue(param.value);
    const formatted = selectedChart === 'windDirection'
      ? Math.round(value).toString()
      : selectedChart === 'windSpeed' ? value.toFixed(2) : value.toFixed(1);
    return `${param.seriesName}: ${formatted}${unit}`;
  });
  return `${originalTime}<br/>${lines.join('<br/>')}`;
};
import { formatXAxisTimestampMs } from './lineChartAxis';
import { getTooltipValue, type TooltipParam } from './lineChartData';
