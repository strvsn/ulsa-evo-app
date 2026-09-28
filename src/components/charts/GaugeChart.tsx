import { useRef, useMemo, useCallback, forwardRef, useImperativeHandle, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { convertWindSpeed, type WindSpeedUnit } from '../../utils/windSpeedConverter';
import { DEFAULT_ULSA_THEME_INDEX, themes } from '../../constants/themes';
import type { DisplaySampleListener } from '../../hooks/ble/types';

export type GaugeType = 'windSpeed' | 'temperature' | 'soundSpeed';

interface GaugeChartProps {
  selectedGauge: GaugeType;
  windSpeed: number | null;
  windSpeedUnit: WindSpeedUnit;
  temperature: number | null;
  soundSpeed: number | null;
  containerSize?: number;
  themeIndex?: number;
  windSpeedMax?: number;
  temperatureMax?: number;
  soundSpeedMax?: number;
  subscribeDisplaySamples?: (listener: DisplaySampleListener) => () => void;
}

export interface GaugeChartRef {
  resize: () => void;
  dispose: () => void;
}

interface GaugeGraphicElement {
  type: 'text';
  left: string;
  top: string;
  style: {
    text: string;
    fontSize: number;
    fontWeight: number;
    fill: string;
    fontFamily: string;
  };
}

interface GaugeDisplayState {
  rawValue: number;
  displayValue: number;
  hasValue: boolean;
  name: string;
  unit: string;
  min: number;
  max: number;
  displayMin: number;
  color: string;
  gradient: string[];
  formattedValue: string;
  ariaDescription: string;
}

/**
 * ゲージチャートコンポーネント
 * 風速・音仮温度・音速を円形ゲージで表示
 */
const GaugeChart = forwardRef<GaugeChartRef, GaugeChartProps>(({
  selectedGauge,
  windSpeed,
  windSpeedUnit,
  temperature,
  soundSpeed,
  containerSize = 400,
  themeIndex = DEFAULT_ULSA_THEME_INDEX,
  windSpeedMax = 5,
  temperatureMax = 35,
  soundSpeedMax = 360,
  subscribeDisplaySamples,
}, ref) => {
  const chartRef = useRef<ReactECharts | null>(null);
  const disposedRef = useRef(false);
  const liveValuesRef = useRef({ windSpeed, temperature, soundSpeed });
  const lastImperativeValueRef = useRef<number | null | undefined>(undefined);
  if (!subscribeDisplaySamples) {
    liveValuesRef.current = { windSpeed, temperature, soundSpeed };
  }

  // コンテナサイズに応じたスケール係数
  const scale = containerSize / 400;
  const fontSize = {
    name: Math.max(Math.round(16 * scale), 11),
    axisLabel: Math.max(Math.round(18 * scale), 12),
    value: Math.max(Math.round(50 * scale), 28),
    unit: Math.max(Math.round(25 * scale), 14),
  };
  const gaugeWidth = Math.max(Math.round(24 * scale), 14);

  // テーマごとのゲージ色を取得
  const currentTheme = themes[themeIndex] || themes[DEFAULT_ULSA_THEME_INDEX];
  const textColor = currentTheme.isLight ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.9)';
  const axisLabelColor = currentTheme.isLight ? 'rgba(0, 0, 0, 0.75)' : 'rgba(255, 255, 255, 0.9)';
  const axisLineColor = currentTheme.isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.3)';

  const disposeGaugeChartInstance = useCallback((chart: ReactECharts | null = chartRef.current) => {
    if (disposedRef.current) return;
    disposedRef.current = true;

    try {
      const instance = chart?.getEchartsInstance();
      if (instance && !instance.isDisposed()) {
        instance.dispose();
      }
    } catch {
      // ECharts may already be detached during React unmount.
    }
  }, []);

  useImperativeHandle(ref, () => ({
    resize: () => {
      if (disposedRef.current) return;
      chartRef.current?.getEchartsInstance()?.resize();
    },
    dispose: () => {
      disposeGaugeChartInstance();
    }
  }), [disposeGaugeChartInstance]);

  useEffect(() => {
    const chart = chartRef.current;
    return () => {
      disposeGaugeChartInstance(chart);
    };
  }, [disposeGaugeChartInstance]);

  const getGaugeDisplayState = useCallback((): GaugeDisplayState => {
    const {
      windSpeed: displayedWindSpeed,
      temperature: displayedTemperature,
      soundSpeed: displayedSoundSpeed,
    } = liveValuesRef.current;
    let value = 0;
    let displayValue = 0;
    let color = '';
    let gradient = ['', ''];
    let name = '';
    let unit = '';
    let max = 100;
    let min = 0;
    let displayMin = 0;
    let hasValue = true;

    switch (selectedGauge) {
      case 'windSpeed':
        hasValue = displayedWindSpeed !== null;
        value = displayedWindSpeed ?? 0;
        displayValue = displayedWindSpeed === null ? 0 : convertWindSpeed(displayedWindSpeed, windSpeedUnit);
        color = currentTheme.gaugeColors.windSpeed.color;
        gradient = currentTheme.gaugeColors.windSpeed.gradient;
        name = '風速';
        unit = windSpeedUnit;
        min = 0;
        max = windSpeedMax;
        displayMin = convertWindSpeed(0, windSpeedUnit);
        break;
      case 'temperature':
        hasValue = displayedTemperature !== null;
        value = displayedTemperature ?? 20;
        displayValue = displayedTemperature ?? 0;
        color = currentTheme.gaugeColors.temperature.color;
        gradient = currentTheme.gaugeColors.temperature.gradient;
        name = '音仮温度';
        unit = '°C';
        min = 20;
        max = temperatureMax;
        displayMin = 20;
        break;
      case 'soundSpeed':
        hasValue = displayedSoundSpeed !== null;
        value = displayedSoundSpeed ?? 330;
        displayValue = displayedSoundSpeed ?? 0;
        color = currentTheme.gaugeColors.soundSpeed.color;
        gradient = currentTheme.gaugeColors.soundSpeed.gradient;
        name = '音速';
        unit = 'm/s';
        min = 330;
        max = soundSpeedMax;
        displayMin = 330;
        break;
    }

    const accessibleDisplayValue = selectedGauge === 'windSpeed'
      ? windSpeedUnit === 'cm/s'
        ? Math.round(displayValue).toString()
        : displayValue.toFixed(2)
      : displayValue.toFixed(1);
    const ariaDescription = hasValue
      ? `${name}ゲージ。現在値は${accessibleDisplayValue} ${unit}です。`
      : `${name}ゲージ。表示できるデータはありません。`;

    return {
      rawValue: value,
      displayValue,
      hasValue,
      name,
      unit,
      min,
      max,
      displayMin,
      color,
      gradient,
      formattedValue: hasValue ? accessibleDisplayValue : '--',
      ariaDescription,
    };
  }, [
    currentTheme,
    selectedGauge,
    soundSpeedMax,
    temperatureMax,
    windSpeedMax,
    windSpeedUnit,
  ]);

  const getGaugeOption = useCallback(() => {
    const display = getGaugeDisplayState();
    const graphicElements: GaugeGraphicElement[] = [
      {
        type: 'text',
        left: 'center',
        top: '32%',
        style: {
          text: display.name,
          fontSize: fontSize.name,
          fontWeight: 500,
          fill: textColor,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'
        }
      }
    ];

    return {
      animationDuration: 50,
      animationDurationUpdate: 0,
      animationEasing: 'linear',
      aria: {
        enabled: true,
        decal: { show: false },
        label: {
          enabled: true,
        description: display.ariaDescription,
        },
      },
      silent: selectedGauge !== 'windSpeed',
      series: [
        {
          type: 'gauge',
          startAngle: 240,
          endAngle: -60,
          min: display.min,
          max: display.max,
          radius: '80%',
          center: ['50%', '50%'],
          silent: selectedGauge !== 'windSpeed',
          pointer: {
            show: false
          },
          progress: {
            show: true,
            overlap: false,
            roundCap: true,
            clip: false,
            itemStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 1,
                y2: 0,
                colorStops: [
                  { offset: 0, color: display.gradient[0] },
                  { offset: 1, color: display.gradient[1] }
                ]
              },
              shadowColor: display.color + '40',
              shadowBlur: 20,
              shadowOffsetY: 5
            },
            width: gaugeWidth
          },
          axisLine: {
            show: true,
            roundCap: true,
            lineStyle: {
              width: gaugeWidth,
              color: [[1, axisLineColor]]
            }
          },
          splitLine: {
            show: false
          },
          axisTick: {
            show: false
          },
          axisLabel: {
            show: true,
            distance: 15,
            color: axisLabelColor,
            fontSize: fontSize.axisLabel,
            fontWeight: 600,
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
            formatter: (value: number) => {
              // 最小値のみ表示（最大値はボタンで管理）
              if (value === display.min) {
                return Math.round(display.displayMin).toString();
              }
              return '';
            }
          },
          title: {
            show: false
          },
          detail: {
            valueAnimation: false,
            formatter: () => display.hasValue
              ? `{value|${display.formattedValue}}\n{unit|${display.unit}}`
              : '{value|--}',
            rich: {
              value: {
                fontSize: fontSize.value,
                fontWeight: 700,
                color: textColor,
                lineHeight: fontSize.value,
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              },
              unit: {
                fontSize: Math.max(13, Math.round(containerSize * 0.0475)),
                fontWeight: 700,
                color: display.color,
                lineHeight: Math.max(21, Math.round(containerSize * 0.0675)),
                fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
              },
            },
            offsetCenter: ['0%', '-3%'],
          },
          data: [
            {
              value: Math.min(Math.max(display.rawValue, display.min), display.max),
              name: display.name,
            }
          ]
        }
      ],
      graphic: graphicElements
    };
  }, [
    axisLabelColor,
    axisLineColor,
    containerSize,
    getGaugeDisplayState,
    fontSize.axisLabel,
    fontSize.name,
    fontSize.unit,
    fontSize.value,
    gaugeWidth,
    selectedGauge,
    textColor,
  ]);

  useEffect(() => {
    if (!subscribeDisplaySamples) return undefined;
    return subscribeDisplaySamples(({ latestSample }) => {
      liveValuesRef.current = {
        windSpeed: latestSample.windSpeed,
        temperature: latestSample.temperature,
        soundSpeed: latestSample.soundSpeed,
      };
      const selectedValue = selectedGauge === 'windSpeed'
        ? latestSample.windSpeed
        : selectedGauge === 'temperature'
          ? latestSample.temperature
          : latestSample.soundSpeed;
      if (Object.is(lastImperativeValueRef.current, selectedValue)) return;
      lastImperativeValueRef.current = selectedValue;
      const instance = chartRef.current?.getEchartsInstance();
      if (!instance || instance.isDisposed()) return;
      instance.setOption(
        getGaugeOption() as Parameters<typeof instance.setOption>[0],
        false,
        false,
      );
    });
  }, [getGaugeOption, selectedGauge, subscribeDisplaySamples]);

  // オプションをメモ化
  const gaugeOption = useMemo(getGaugeOption, [getGaugeOption]);

  return (
    <ReactECharts
      ref={chartRef}
      option={gaugeOption}
      style={{ height: '100%', width: '100%', pointerEvents: 'none' }}
      notMerge={false}
      lazyUpdate={false}
      opts={{ renderer: 'svg' }}
    />
  );
});

export default GaugeChart;
