import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GaugeChart from './GaugeChart';

const echartsMock = vi.hoisted(() => ({
  options: [] as unknown[],
}));

vi.mock('echarts-for-react', async () => {
  const React = await import('react');

  return {
    default: React.forwardRef<HTMLDivElement, { option?: unknown }>((props, ref) => {
      echartsMock.options.push(props.option);
      return <div ref={ref} data-testid="gauge-chart" />;
    }),
  };
});

type GaugeOption = {
  aria?: {
    enabled?: boolean;
    decal?: { show?: boolean };
    label?: {
      enabled?: boolean;
      description?: string;
    };
  };
};

const latestOption = (): GaugeOption => echartsMock.options.at(-1) as GaugeOption;

const renderGauge = (props: Partial<React.ComponentProps<typeof GaugeChart>> = {}) => render(
  <GaugeChart
    selectedGauge="windSpeed"
    windSpeed={1.234}
    windSpeedUnit="m/s"
    temperature={24.5}
    soundSpeed={344.2}
    {...props}
  />
);

describe('GaugeChart accessibility description', () => {
  beforeEach(() => {
    echartsMock.options.length = 0;
  });

  afterEach(() => {
    cleanup();
  });

  it('enables ECharts aria and describes the displayed value with its unit', () => {
    renderGauge();

    expect(latestOption().aria).toEqual({
      enabled: true,
      decal: { show: false },
      label: {
        enabled: true,
        description: '風速ゲージ。現在値は1.23 m/sです。',
      },
    });
  });

  it('uses the converted display value and selected wind-speed unit', () => {
    renderGauge({ windSpeedUnit: 'cm/s' });

    expect(latestOption().aria?.label?.description)
      .toBe('風速ゲージ。現在値は123 cm/sです。');
  });

  it('describes temperature with the temperature unit', () => {
    renderGauge({ selectedGauge: 'temperature' });

    expect(latestOption().aria?.label?.description)
      .toBe('音仮温度ゲージ。現在値は24.5 °Cです。');
  });

  it('announces no data without inventing a value', () => {
    renderGauge({ selectedGauge: 'soundSpeed', soundSpeed: null });

    expect(latestOption().aria?.label?.description)
      .toBe('音速ゲージ。表示できるデータはありません。');
  });
});
