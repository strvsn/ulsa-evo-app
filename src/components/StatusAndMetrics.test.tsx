import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MetricsGrid from './MetricsGrid';
import StatusCard from './StatusCard';
import { ReferenceWindSpeedWindow } from '../utils/derivedWindMetrics';
import { DERIVED_METRIC_PREFERENCES_STORAGE_KEY } from './derived-metrics/derivedMetricPreferences';

const renderPerfStats = vi.hoisted(() => ({
  recordPerfEvent: vi.fn(),
}));

vi.mock('../utils/renderPerfDiagnostics', () => ({
  recordPerfEvent: renderPerfStats.recordPerfEvent,
}));

const createDerivedMetricBufferRefs = () => {
  const referenceWindSpeedWindow = new ReferenceWindSpeedWindow();
  const now = Date.now();
  referenceWindSpeedWindow.push(2, now - 60_000);
  referenceWindSpeedWindow.push(4, now - 30_000);

  return {
    bufferRefs: {
      referenceWindSpeedWindowRef: { current: referenceWindSpeedWindow },
    },
  };
};

describe('dashboard status displays', () => {
  beforeEach(() => {
    renderPerfStats.recordPerfEvent.mockClear();
    window.localStorage.clear();
  });

  it('shows empty readings without a separate sensor-status badge', () => {
    const { rerender } = render(
      <MetricsGrid
        windSpeed={null}
        windSpeedAverage10m={null}
        windSpeedUnit="m/s"
        windDirection={null}
        headingSpeed={null}
        temperature={null}
        soundSpeed={null}
      />
    );

    expect(screen.getAllByText('--')).toHaveLength(6);
    expect(screen.queryByText('NO DATA')).not.toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
    expect(screen.queryByText('DATA STOPPED')).not.toBeInTheDocument();

    rerender(
      <MetricsGrid
        windSpeed={1.23}
        windSpeedAverage10m={1.11}
        windSpeedUnit="m/s"
        windDirection={42}
        headingSpeed={0.45}
        temperature={24.5}
        soundSpeed={343.2}
      />
    );

    expect(screen.getByText('10分平均風速')).toBeInTheDocument();
    expect(screen.getByText('音仮温度')).toBeInTheDocument();
    expect(screen.getByText(/1\.11/)).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('renders wind utility cards as text-first readings without icons', () => {
    const { container } = render(
      <MetricsGrid
        windSpeed={1.23}
        windSpeedAverage10m={1.11}
        windSpeedUnit="m/s"
        windDirection={42}
        headingSpeed={0.45}
        temperature={24.5}
        soundSpeed={343.2}
      />
    );

    const windSpeedCard = container.querySelector('.wind-speed-card');
    const windDirectionCard = container.querySelector('.wind-direction-card');
    const headingSpeedCard = container.querySelector('.heading-speed-card');
    const windAverageCard = container.querySelector('.wind-speed-average-card');
    const temperatureCard = container.querySelector('.temperature-card');
    const soundSpeedCard = container.querySelector('.sound-speed-card');

    expect(windSpeedCard).toHaveClass('metric-card-text', 'metric-card-primary');
    expect(windDirectionCard).toHaveClass('metric-card-text', 'metric-card-primary');
    expect(headingSpeedCard).toHaveClass('metric-card-text', 'metric-card-primary');
    expect(windAverageCard).toHaveClass('metric-card-text', 'metric-card-secondary');
    expect(container.querySelectorAll('.metric-card-uniform-type')).toHaveLength(6);
    expect(windSpeedCard?.querySelector('.metric-icon-container')).toBeNull();
    expect(windDirectionCard?.querySelector('.metric-icon-container')).toBeNull();
    expect(headingSpeedCard?.querySelector('.metric-icon-container')).toBeNull();
    expect(windAverageCard?.querySelector('.metric-icon-container')).toBeNull();
    expect(temperatureCard?.querySelector('.metric-icon-container')).toBeNull();
    expect(soundSpeedCard?.querySelector('.metric-icon-container')).toBeNull();

    const metricsGrid = container.querySelector('.metrics-grid');
    expect(metricsGrid).not.toBeNull();
    [
      windSpeedCard,
      windDirectionCard,
      headingSpeedCard,
      temperatureCard,
      soundSpeedCard,
      windAverageCard,
      container.querySelector('.derived-metric-add-card'),
    ].forEach((card) => {
      expect(card?.parentElement).toBe(metricsGrid);
    });

    expect(screen.getByText('10分平均風速')).toBeInTheDocument();
    expect(screen.queryByText('参考')).not.toBeInTheDocument();
    expect(screen.getByText(/1\.11/)).toBeInTheDocument();
    expect(headingSpeedCard).toHaveTextContent('+0.45m/s');
    expect(headingSpeedCard).toHaveTextContent('＋ 向かい風 · − 追い風');
    expect(container.querySelectorAll('.metric-number')).toHaveLength(6);
  });

  it('converts current and 10 minute average wind speed with the selected unit', () => {
    const { container, rerender } = render(
      <MetricsGrid
        windSpeed={1.23}
        windSpeedAverage10m={1.11}
        windSpeedUnit="km/h"
        windDirection={42}
        headingSpeed={0.45}
        temperature={24.5}
        soundSpeed={343.2}
      />
    );

    expect(container.querySelector('.wind-speed-card')).toHaveTextContent(/4\.43km\/h/);
    expect(container.querySelector('.wind-speed-average-card')).toHaveTextContent(/4\.00km\/h/);
    expect(container.querySelector('.heading-speed-card')).toHaveTextContent('+1.62km/h');

    rerender(
      <MetricsGrid
        windSpeed={1.23}
        windSpeedAverage10m={1.11}
        windSpeedUnit="cm/s"
        windDirection={42}
        headingSpeed={-0.45}
        temperature={24.5}
        soundSpeed={343.2}
      />
    );

    expect(container.querySelector('.wind-speed-card')).toHaveTextContent(/123cm\/s/);
    expect(container.querySelector('.wind-speed-average-card')).toHaveTextContent(/111cm\/s/);
    expect(container.querySelector('.heading-speed-card')).toHaveTextContent('-45cm/s');
  });

  it('keeps the same fixed-slot value and unit elements across digit boundaries', () => {
    const props = {
      windSpeed: 9.99,
      windSpeedAverage10m: 9.99,
      windSpeedUnit: 'm/s' as const,
      windDirection: 9,
      headingSpeed: 0.01,
      temperature: 9.9,
      soundSpeed: 99.9,
    };
    const { container, rerender } = render(<MetricsGrid {...props} />);
    const windNumber = container.querySelector('.wind-speed-card .metric-number');
    const windUnit = container.querySelector('.wind-speed-card .metric-unit');
    const directionNumber = container.querySelector('.wind-direction-card .metric-number');
    const headingNumber = container.querySelector('.heading-speed-card .metric-number');

    rerender(
      <MetricsGrid
        {...props}
        windSpeed={10}
        windSpeedAverage10m={10}
        windDirection={359}
        headingSpeed={-10}
        temperature={10}
        soundSpeed={343.2}
      />
    );

    expect(container.querySelector('.wind-speed-card .metric-number')).toBe(windNumber);
    expect(container.querySelector('.wind-speed-card .metric-unit')).toBe(windUnit);
    expect(container.querySelector('.wind-direction-card .metric-number')).toBe(directionNumber);
    expect(container.querySelector('.heading-speed-card .metric-number')).toBe(headingNumber);
    expect(windNumber).toHaveTextContent('10.00');
    expect(windUnit).toHaveTextContent('m/s');
    expect(directionNumber).toHaveTextContent('359');
    expect(headingNumber).toHaveTextContent('-10.00');
  });

  it('updates live metric text without rerendering the metrics grid', () => {
    let presentationListener: ((values: {
      windSpeed: number | null;
      windSpeedAverage10m: number | null;
      windDirection: number | null;
      windDirectionContinuous: number;
      headingSpeed: number | null;
      temperature: number | null;
      soundSpeed: number | null;
    }) => void) | null = null;
    const initialValues = {
      windSpeed: 1,
      windSpeedAverage10m: 0.9,
      windDirection: 10,
      windDirectionContinuous: 10,
      headingSpeed: 0.4,
      temperature: 20,
      soundSpeed: 340,
    };
    const { container } = render(
      <MetricsGrid
        windSpeed={initialValues.windSpeed}
        windSpeedAverage10m={initialValues.windSpeedAverage10m}
        windSpeedUnit="m/s"
        windDirection={initialValues.windDirection}
        headingSpeed={initialValues.headingSpeed}
        temperature={initialValues.temperature}
        soundSpeed={initialValues.soundSpeed}
        getPresentationValues={() => initialValues}
        subscribePresentationValues={(listener) => {
          presentationListener = listener;
          listener(initialValues);
          return () => { presentationListener = null; };
        }}
      />
    );
    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);

    act(() => {
      presentationListener?.({
        windSpeed: 2.34,
        windSpeedAverage10m: 1.23,
        windDirection: 359,
        windDirectionContinuous: 359,
        headingSpeed: -0.5,
        temperature: null,
        soundSpeed: 343.2,
      });
    });

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-metric-id="windSpeed"]')).toHaveTextContent('2.34m/s');
    expect(container.querySelector('[data-metric-id="windDirection"]')).toHaveTextContent('359°');
    expect(container.querySelector('[data-metric-id="headingSpeed"]')).toHaveTextContent('-0.50m/s');
    expect(container.querySelector('[data-metric-id="windSpeedAverage10m"]')).toHaveTextContent('1.23m/s');
    expect(container.querySelector('[data-metric-id="temperature"] .metric-number')).toHaveTextContent('--');
    expect(container.querySelector('[data-metric-id="temperature"] .metric-unit')).toHaveAttribute('hidden');
  });

  it('lets users add, remove, and restore selected reference metric cards', () => {
    const { bufferRefs } = createDerivedMetricBufferRefs();
    const props = {
      windSpeed: 1.23,
      windSpeedAverage10m: 1.11,
      windSpeedUnit: 'm/s' as const,
      windDirection: 42,
      headingSpeed: 0.45,
      temperature: 24.5,
      soundSpeed: 343.2,
      bufferRefs,
    };
    const firstRender = render(<MetricsGrid {...props} />);

    expect(screen.getByLabelText('10分平均風速を削除')).toHaveAttribute('data-control-size', 'I44');
    expect(screen.getByLabelText('参考指標を追加')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('10分平均風速を削除'));

    expect(screen.queryByText('10分平均風速')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY)).toBe('[]');

    fireEvent.click(screen.getByLabelText('参考指標を追加'));
    expect(screen.getByLabelText('参考指標を選択')).toBeInTheDocument();
    expect(firstRender.container.querySelector('.metrics-grid .derived-metric-picker')).toBeNull();
    expect(firstRender.container.querySelector('.metrics-fixed > .derived-metric-picker')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '10分観測最大風速、追加' }));

    expect(document.querySelector('.derived-metric-observedMaxWindSpeed10m')).toHaveTextContent('4.00m/s');
    expect(screen.getByLabelText('10分観測最大風速を削除')).toBeInTheDocument();
    expect(screen.queryByLabelText('参考指標を選択')).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY)).toBe('["observedMaxWindSpeed10m"]');

    fireEvent.click(screen.getByLabelText('参考指標を追加'));
    const selectedOption = screen.getByRole('button', { name: '10分観測最大風速、表示中' });
    expect(selectedOption).toHaveAttribute('aria-disabled', 'true');
    expect(selectedOption).not.toBeDisabled();
    fireEvent.click(selectedOption);
    expect(screen.getByLabelText('参考指標を選択')).toBeInTheDocument();

    firstRender.unmount();
    render(<MetricsGrid {...props} />);

    expect(screen.queryByText('10分平均風速')).not.toBeInTheDocument();
    expect(screen.getByLabelText('10分観測最大風速を削除')).toBeInTheDocument();
  });

  it('does not offer direction-based or turbulence cards left in an older preference', () => {
    window.localStorage.setItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY, JSON.stringify([
      'turbulenceIntensity10m', 'windDirectionVariability10m',
      'vectorMeanWindSpeed10m', 'vectorMeanWindDirection10m',
    ]));
    render(<MetricsGrid windSpeed={1} windSpeedAverage10m={1} windSpeedUnit="m/s"
      windDirection={0} headingSpeed={0} temperature={20} soundSpeed={343} />);
    expect(screen.queryByText('10分乱流強度')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('参考指標を追加'));
    expect(screen.getByRole('button', { name: '10分平均風速、追加' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10分観測最大風速、追加' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /乱流強度|風向変動|ベクトル平均/ })).not.toBeInTheDocument();
  });

  it('converts both received-speed references using the selected display unit', () => {
    const { bufferRefs } = createDerivedMetricBufferRefs();
    window.localStorage.setItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY,
      JSON.stringify(['windSpeedAverage10m', 'observedMaxWindSpeed10m']));
    const props = { windSpeed: 4, windSpeedAverage10m: 3, windDirection: 0,
      headingSpeed: 0, temperature: 20, soundSpeed: 343, bufferRefs };
    const view = render(<MetricsGrid {...props} windSpeedUnit="km/h" />);
    expect(view.container.querySelector('[data-metric-id="windSpeedAverage10m"]')).toHaveTextContent('10.80km/h');
    expect(view.container.querySelector('[data-metric-id="observedMaxWindSpeed10m"]')).toHaveTextContent('14.40km/h');
    view.rerender(<MetricsGrid {...props} windSpeedUnit="cm/s" />);
    expect(view.container.querySelector('[data-metric-id="windSpeedAverage10m"]')).toHaveTextContent('300cm/s');
    expect(view.container.querySelector('[data-metric-id="observedMaxWindSpeed10m"]')).toHaveTextContent('400cm/s');
  });

  it('ages a reference card out without requiring another BLE sample or parent render', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      const now = 1_000_000;
      vi.setSystemTime(now);
      const referenceWindSpeedWindow = new ReferenceWindSpeedWindow(10, 1_000);
      referenceWindSpeedWindow.push(4, now - 900);
      window.localStorage.setItem(DERIVED_METRIC_PREFERENCES_STORAGE_KEY,
        JSON.stringify(['windSpeedAverage10m', 'observedMaxWindSpeed10m']));
      const view = render(<MetricsGrid windSpeed={4} windSpeedAverage10m={4} windSpeedUnit="m/s"
        windDirection={0} headingSpeed={0} temperature={20} soundSpeed={343}
        bufferRefs={{ referenceWindSpeedWindowRef: { current: referenceWindSpeedWindow } }} />);
      expect(view.container.querySelector('[data-metric-id="windSpeedAverage10m"]')).toHaveTextContent('4.00m/s');
      expect(view.container.querySelector('[data-metric-id="observedMaxWindSpeed10m"]')).toHaveTextContent('4.00m/s');
      act(() => { vi.advanceTimersByTime(1_000); });
      expect(view.container.querySelector('[data-metric-id="windSpeedAverage10m"]')).toHaveTextContent('--');
      expect(view.container.querySelector('[data-metric-id="observedMaxWindSpeed10m"]')).toHaveTextContent('--');
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('memoizes unchanged metric readings but rerenders when a visible reading changes', () => {
    const props = {
      windSpeed: 1.23,
      windSpeedAverage10m: 1.11,
      windSpeedUnit: 'm/s' as const,
      windDirection: 42,
      headingSpeed: 0.45,
      temperature: 24.5,
      soundSpeed: 343.2,
    };
    const { rerender } = render(<MetricsGrid {...props} />);

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledWith('MetricsGrid.render');
    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);

    rerender(<MetricsGrid {...props} />);

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);

    rerender(<MetricsGrid {...props} windSpeed={2.34} />);

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2\.34/)).toBeInTheDocument();
  });

  it('shows live sensor state in the BLE card instead of connection-only wording', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <StatusCard
        connectionState="connected"
        dataState="live"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={onClick}
      />
    );

    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVO #1 データ受信中')).toBeInTheDocument();
    expect(screen.queryByText('接続済み')).not.toBeInTheDocument();

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="idle"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={onClick}
      />
    );

    expect(screen.getByText('データ待ち')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVO #1 のデータを待機中')).toBeInTheDocument();
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument();
  });

  it('distinguishes waiting and stale BLE states', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <StatusCard
        connectionState="connected"
        dataState="waiting"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={onClick}
      />
    );

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledWith('StatusCard.render');
    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);
    expect(screen.getByText('データ待ち')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVO #1 のデータを待機中')).toBeInTheDocument();
    expect(screen.getByLabelText('BLE電波強度: 非常に良好')).toHaveAttribute('data-level', '4');
    expect(document.querySelector('.connection-icon.lucide-radio-tower')).not.toBeInTheDocument();
    expect(document.querySelector('.lucide-bluetooth')).not.toBeInTheDocument();

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="waiting"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={onClick}
      />
    );

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(1);

    rerender(
      <StatusCard
        connectionState="connected"
        dataState="stale"
        deviceName="ULSA EVO #1"
        signalRssi={-55}
        onClick={onClick}
      />
    );

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(2);
    expect(screen.getByText('データ停止')).toBeInTheDocument();
    expect(screen.getByText('ULSA EVO #1 からのデータが停止しています')).toBeInTheDocument();
  });
});
