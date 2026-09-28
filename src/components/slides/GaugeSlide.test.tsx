import { createRef } from 'react';
import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GaugeSlide from './GaugeSlide';
import type { GaugeChartRef } from '../charts';
import { DEFAULT_ULSA_THEME_INDEX } from '../../constants/themes';

const renderPerfStats = vi.hoisted(() => ({
  recordPerfEvent: vi.fn(),
}));

const resizeObserverStats = vi.hoisted(() => ({
  callback: undefined as ResizeObserverCallback | undefined,
  disconnect: vi.fn(),
  observe: vi.fn(),
}));

vi.mock('../../utils/renderPerfDiagnostics', () => ({
  recordPerfEvent: renderPerfStats.recordPerfEvent,
}));

vi.mock('../charts/GaugeChart', async () => {
  const React = await import('react');

  return {
    default: React.forwardRef((props: { selectedGauge: string }, ref) => {
      React.useImperativeHandle(ref, () => ({
        resize: vi.fn(),
        dispose: vi.fn(),
      }));
      return <div data-testid="gauge-chart" data-selected-gauge={props.selectedGauge} />;
    }),
  };
});

const createGaugeSlideProps = (overrides: Partial<ComponentProps<typeof GaugeSlide>> = {}) => ({
  isActive: true,
  selectedGauge: 'windSpeed' as const,
  onGaugeChange: vi.fn(),
  windSpeed: 1.23,
  windSpeedUnit: 'm/s' as const,
  temperature: 24.5,
  soundSpeed: 343.2,
  windDirectionContinuous: 45,
  onUnitCycle: vi.fn(),
  gaugeChartRef: createRef<GaugeChartRef>(),
  themeIndex: DEFAULT_ULSA_THEME_INDEX,
  windSpeedMax: 5,
  temperatureMax: 45,
  soundSpeedMax: 380,
  onMaxChange: vi.fn(),
  ...overrides,
});

const renderGaugeSlide = (options: { isActive: boolean }) => render(
  <GaugeSlide
    {...createGaugeSlideProps({ isActive: options.isActive })}
  />
);

const renderGaugeSlideWithProps = (props: ComponentProps<typeof GaugeSlide>) => render(
  <GaugeSlide
    {...props}
  />
);

let gaugeRectHeight = 400;
let gaugeRectWidth = 400;

describe('GaugeSlide', () => {
  beforeEach(() => {
    gaugeRectHeight = 400;
    gaugeRectWidth = 400;
    renderPerfStats.recordPerfEvent.mockClear();
    resizeObserverStats.callback = undefined;
    resizeObserverStats.disconnect.mockClear();
    resizeObserverStats.observe.mockClear();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        resizeObserverStats.callback = callback;
      }

      observe = resizeObserverStats.observe;
      disconnect = resizeObserverStats.disconnect;
      unobserve = vi.fn();
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: gaugeRectWidth,
      height: gaugeRectHeight,
      top: 0,
      right: gaugeRectWidth,
      bottom: gaugeRectHeight,
      left: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps controls visible but skips GaugeChart while inactive', () => {
    const { container } = renderGaugeSlide({ isActive: false });

    expect(screen.queryByTestId('gauge-chart')).not.toBeInTheDocument();
    const unitButton = container.querySelector<HTMLButtonElement>('.unit-switch-button');
    const rangeButton = container.querySelector<HTMLButtonElement>('.max-value-button');
    const controlBar = container.querySelector<HTMLDivElement>('.gauge-control-bar');

    expect(container.querySelector('.max-value-button')).toHaveTextContent('5');
    expect(screen.getByText('音仮温度')).toBeInTheDocument();
    expect(container.querySelector('.unit-switch-button')).toHaveTextContent('m/s');
    expect(rangeButton).toHaveTextContent('表示範囲0–5 m/s');
    expect(unitButton).toHaveTextContent('単位m/s');
    expect(controlBar).toContainElement(unitButton);
    expect(controlBar).toContainElement(rangeButton);
    expect(container.querySelector('.gauge-container-main')).not.toContainElement(unitButton);
  });

  it('cycles the wind-speed display range from 10 to 25 m/s', () => {
    const onMaxChange = vi.fn();
    const { container } = renderGaugeSlideWithProps(createGaugeSlideProps({
      windSpeedMax: 10,
      onMaxChange,
    }));

    fireEvent.click(container.querySelector<HTMLButtonElement>('.max-value-button')!);

    expect(onMaxChange).toHaveBeenCalledWith('windSpeed', 25);
  });

  it('renders GaugeChart when active and sized', async () => {
    renderGaugeSlide({ isActive: true });

    expect(await screen.findByTestId('gauge-chart')).toHaveAttribute('data-selected-gauge', 'windSpeed');
  });

  it('observes gauge container size only while active', () => {
    const stableProps = createGaugeSlideProps({ isActive: false });
    const { rerender } = renderGaugeSlideWithProps(stableProps);

    expect(resizeObserverStats.observe).not.toHaveBeenCalled();

    rerender(<GaugeSlide {...stableProps} isActive />);

    expect(resizeObserverStats.observe).toHaveBeenCalledTimes(1);

    rerender(<GaugeSlide {...stableProps} isActive={false} />);

    expect(resizeObserverStats.disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps unchanged active resize measurements from rerendering', async () => {
    renderGaugeSlide({ isActive: true });

    expect(await screen.findByTestId('gauge-chart')).toHaveAttribute('data-selected-gauge', 'windSpeed');
    const renderCountAfterInitialLayout = renderPerfStats.recordPerfEvent.mock.calls.length;

    act(() => {
      resizeObserverStats.callback?.([], {} as ResizeObserver);
    });

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(renderCountAfterInitialLayout);

    gaugeRectWidth = 420;
    gaugeRectHeight = 420;
    act(() => {
      resizeObserverStats.callback?.([], {} as ResizeObserver);
    });

    expect(renderPerfStats.recordPerfEvent.mock.calls.length).toBeGreaterThan(renderCountAfterInitialLayout);
  });

  it('memoizes unchanged active props but rerenders when a visible gauge value changes', async () => {
    const stableProps = createGaugeSlideProps({ isActive: true });
    const { rerender } = renderGaugeSlideWithProps(stableProps);

    expect(await screen.findByTestId('gauge-chart')).toHaveAttribute('data-selected-gauge', 'windSpeed');
    const renderCountAfterInitialLayout = renderPerfStats.recordPerfEvent.mock.calls.length;

    rerender(<GaugeSlide {...stableProps} />);

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(renderCountAfterInitialLayout);

    rerender(<GaugeSlide {...stableProps} windSpeed={2.34} />);

    expect(renderPerfStats.recordPerfEvent.mock.calls.length).toBeGreaterThan(renderCountAfterInitialLayout);
  });

  it('memoizes inactive live value changes but rerenders when activated', async () => {
    const stableProps = createGaugeSlideProps({ isActive: false });
    const { rerender } = renderGaugeSlideWithProps(stableProps);

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledWith('GaugeSlide.render');
    const renderCountAfterInitialLayout = renderPerfStats.recordPerfEvent.mock.calls.length;

    rerender(
      <GaugeSlide
        {...stableProps}
        windSpeed={9.87}
        temperature={31.2}
        soundSpeed={350.1}
        windDirectionContinuous={180}
      />
    );

    expect(renderPerfStats.recordPerfEvent).toHaveBeenCalledTimes(renderCountAfterInitialLayout);
    expect(screen.queryByTestId('gauge-chart')).not.toBeInTheDocument();

    rerender(
      <GaugeSlide
        {...stableProps}
        isActive
        windSpeed={9.87}
        temperature={31.2}
        soundSpeed={350.1}
        windDirectionContinuous={180}
      />
    );

    expect(renderPerfStats.recordPerfEvent.mock.calls.length).toBeGreaterThan(renderCountAfterInitialLayout);
    expect(await screen.findByTestId('gauge-chart')).toHaveAttribute('data-selected-gauge', 'windSpeed');
  });
});
