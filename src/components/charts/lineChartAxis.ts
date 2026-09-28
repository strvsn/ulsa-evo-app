type XAxisLabelAlign = 'center' | 'right';
type XAxisLabelVerticalAlign = 'middle' | 'top';

interface XAxisLabelLayout {
  interval: number;
  rotate: number;
  margin: number;
  gridBottom: string;
  align: XAxisLabelAlign;
  verticalAlign: XAxisLabelVerticalAlign;
  splitNumber: number;
  timeLabelFormat: 'full' | 'compact';
}

const COMPACT_TIME_LABEL_LENGTH = 5;
const FULL_TIME_LABEL_LENGTH = 8;
const MAX_HORIZONTAL_TIME_LABELS = 8;
const MIN_FULL_TIME_LABELS = 4;

const padTimePart = (value: string | undefined): string => {
  if (!value) return '00';
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric)
    ? numeric.toString().padStart(2, '0').slice(-2)
    : '00';
};

export const formatXAxisTimestamp = (timestamp: string): string => {
  if (!timestamp || typeof timestamp !== 'string') return '00:00:00';

  const match = timestamp.match(/(\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (match) {
    return `${padTimePart(match[1])}:${padTimePart(match[2])}:${padTimePart(match[3])}`;
  }

  const parts = timestamp.split(':');
  if (parts.length >= 3) {
    return `${padTimePart(parts[0])}:${padTimePart(parts[1])}:${padTimePart(parts[2])}`;
  }
  if (parts.length === 2) {
    return `00:${padTimePart(parts[0])}:${padTimePart(parts[1])}`;
  }

  return '00:00:00';
};

export const formatXAxisTimestampMs = (timestampMs: number): string => {
  if (!Number.isFinite(timestampMs)) return '00:00:00';

  const date = new Date(timestampMs);
  return [
    date.getHours().toString().padStart(2, '0'),
    date.getMinutes().toString().padStart(2, '0'),
    date.getSeconds().toString().padStart(2, '0'),
  ].join(':');
};

export const formatCompactXAxisTimestampMs = (timestampMs: number): string => {
  if (!Number.isFinite(timestampMs)) return '00:00';

  const date = new Date(timestampMs);
  return [
    date.getMinutes().toString().padStart(2, '0'),
    date.getSeconds().toString().padStart(2, '0'),
  ].join(':');
};

export const getXAxisLabelLayout = (
  labelCount: number,
  chartWidth: number,
  axisFontSize: number
): XAxisLabelLayout => {
  if (labelCount <= 0) {
    return {
      interval: 0,
      rotate: 0,
      margin: 8,
      gridBottom: '8px',
      align: 'center',
      verticalAlign: 'middle',
      splitNumber: 1,
      timeLabelFormat: 'compact',
    };
  }

  const safeChartWidth = Number.isFinite(chartWidth) && chartWidth > 0 ? chartWidth : 320;
  const compactLabelWidth = COMPACT_TIME_LABEL_LENGTH * axisFontSize * 0.62;
  const fullLabelWidth = FULL_TIME_LABEL_LENGTH * axisFontSize * 0.62;
  const fullLabelBudget = fullLabelWidth + 16;
  const timeLabelFormat = safeChartWidth >= fullLabelBudget * MIN_FULL_TIME_LABELS
    ? 'full'
    : 'compact';
  const horizontalLabelBudget = (timeLabelFormat === 'full' ? fullLabelWidth : compactLabelWidth) + 16;
  const horizontalTarget = Math.min(
    labelCount,
    MAX_HORIZONTAL_TIME_LABELS,
    Math.max(2, Math.floor(safeChartWidth / horizontalLabelBudget)),
  );

  return {
    interval: Math.max(Math.ceil(labelCount / Math.max(horizontalTarget, 1)) - 1, 0),
    rotate: 0,
    margin: 8,
    // containLabel reserves the horizontal time label extent. Keep only the
    // small visual inset instead of a second percentage-based gutter.
    gridBottom: '8px',
    align: 'center',
    verticalAlign: 'middle',
    splitNumber: Math.max(horizontalTarget - 1, 1),
    timeLabelFormat,
  };
};
