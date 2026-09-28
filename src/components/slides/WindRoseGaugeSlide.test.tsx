import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WindRoseGaugeSlide from './WindRoseGaugeSlide';
import { calculateTrueWind } from '../../utils/trueWind';
import type { WindReferenceNavigationState } from '../../hooks/useWindReferenceNavigation';

const windPipMock = vi.hoisted(() => ({
  available: true,
  active: false,
  possible: true,
  busy: false,
  canStart: true,
  error: null as string | null,
  toggle: vi.fn(),
  options: null as null | Record<string, unknown>,
}));

const navigationMock = vi.hoisted(() => ({
  state: {
    mode: 'off',
    isSupported: true,
    status: 'ready',
    trueHeading: 128,
    headingAccuracy: 3,
    headingTimestampMs: 123_456,
    gnssSample: {
      speedMps: 5,
      speedAccuracyMps: 0.2,
      courseDegrees: 85,
      courseAccuracyDegrees: 3,
      horizontalAccuracyMeters: 4,
      timestampMs: 123_456,
      available: true,
      authorization: 'authorized',
      accuracyAuthorization: 'full',
    },
    gnssAssessment: {
      status: 'ready',
      usable: true,
      platformSpeedMps: 5,
      platformCourseDegrees: 85,
      reason: null,
    },
    gnssAgeMs: 0,
    gnssStaleAfterMs: 5_000,
  } as WindReferenceNavigationState,
}));

const nativeHeadingCapabilityMock = vi.hoisted(() => ({ available: true }));

vi.mock('../../hooks/useWindPip', () => ({
  useWindPip: (options: Record<string, unknown>) => {
    windPipMock.options = options;
    return windPipMock;
  },
}));

vi.mock('../../services/nativeTrueHeading', () => ({
  isNativeTrueHeadingAvailable: () => nativeHeadingCapabilityMock.available,
}));

vi.mock('../../hooks/useWindReferenceNavigation', () => ({
  useWindReferenceNavigation: (mode: 'off' | 'compass' | 'gnss') => ({
    ...navigationMock.state,
    mode,
  }),
}));

vi.mock('../charts', () => ({
  WindRoseGauge: (props: {
    isActive?: boolean;
    windSpeed: number | null;
    windDirectionContinuous: number;
    sampleTimestampMs?: number | null;
    hasWindData?: boolean;
    hasWindDirection?: boolean;
    isTilted?: boolean;
    tiltDegrees?: number;
    themeVariant?: string;
    trueHeading?: number | null;
    headingAccuracy?: number | null;
    centerPrimaryMetric?: 'windDirection' | 'groundSpeed';
    groundSpeedMps?: number | null;
    directionReference?: 'ulsa' | 'trueNorth' | 'trueWind' | 'gnssPending';
    peakHolds?: ReadonlyArray<{ bankIndex: 0 | 1 | 2; rayActivity: Float32Array }>;
    onPeakHoldFrameChange?: (snapshot: {
      rayActivity: Float32Array;
      speedMps: number;
      displayDirectionDegrees: number;
      displayRotationDegrees: number;
      directionReference: 'ulsa' | 'trueNorth' | 'trueWind' | 'gnssPending';
    }) => void;
  }) => (
    <div
      data-testid="wind-rose-gauge"
      data-active={String(props.isActive)}
      data-speed={String(props.windSpeed)}
      data-direction={String(props.windDirectionContinuous)}
      data-sample-timestamp={String(props.sampleTimestampMs)}
      data-has-wind-data={String(props.hasWindData)}
      data-has-wind-direction={String(props.hasWindDirection)}
      data-tilted={String(props.isTilted)}
      data-tilt-degrees={String(props.tiltDegrees)}
      data-theme-variant={String(props.themeVariant)}
      data-true-heading={String(props.trueHeading)}
      data-heading-accuracy={String(props.headingAccuracy)}
      data-center-primary-metric={String(props.centerPrimaryMetric)}
      data-ground-speed-mps={String(props.groundSpeedMps)}
      data-direction-reference={String(props.directionReference)}
      data-peak-hold-count={String(props.peakHolds?.length ?? 0)}
      data-peak-hold-banks={props.peakHolds?.map(({ bankIndex }) => bankIndex).join(',') ?? ''}
      onClick={() => {
        const activity = new Float32Array(120);
        activity[24] = 0.82;
        props.onPeakHoldFrameChange?.({
          rayActivity: activity,
          speedMps: 2.34,
          displayDirectionDegrees: 73.6,
          displayRotationDegrees: 0,
          directionReference: props.directionReference
            ?? (props.trueHeading === null ? 'ulsa' : 'trueNorth'),
        });
      }}
    />
  ),
}));

const createProps = (overrides: Partial<ComponentProps<typeof WindRoseGaugeSlide>> = {}) => ({
  isActive: true,
  windSpeed: 2.34,
  windSpeedUnit: 'm/s' as const,
  windDirectionContinuous: 73,
  temperature: 24.7,
  soundSpeed: 346.9,
  headingSpeed: -0.44,
  windSpeedAverage10m: 1.92,
  cardLogState: 'recording' as const,
  appLogState: 'ready' as const,
  sampleTimestampMs: 123_456,
  themeIsLight: false,
  isUlsaConnected: true,
  onUnitCycle: vi.fn(),
  ...overrides,
});

describe('WindRoseGaugeSlide', () => {
  beforeEach(() => {
    nativeHeadingCapabilityMock.available = true;
    navigationMock.state.status = 'ready';
    navigationMock.state.trueHeading = 128;
    navigationMock.state.headingAccuracy = 3;
    navigationMock.state.headingTimestampMs = 123_456;
    navigationMock.state.gnssSample = {
      speedMps: 5,
      speedAccuracyMps: 0.2,
      courseDegrees: 85,
      courseAccuracyDegrees: 3,
      horizontalAccuracyMeters: 4,
      timestampMs: 123_456,
      available: true,
      authorization: 'authorized',
      accuracyAuthorization: 'full',
    };
    navigationMock.state.gnssAssessment = {
      status: 'ready',
      usable: true,
      platformSpeedMps: 5,
      platformCourseDegrees: 85,
      reason: null,
    };
  });

  it('starts iOS Picture in Picture only from its explicit control', () => {
    windPipMock.toggle.mockClear();
    render(<WindRoseGaugeSlide {...createProps()} />);

    const pipButton = screen.getByRole('button', { name: 'ピクチャーインピクチャーを開始' });
    expect(pipButton).toHaveClass('wind-rose-corner-action-right');
    expect(pipButton).toHaveAttribute('data-control-size', 'I44');
    expect(pipButton).toHaveAttribute('data-control-interaction', 'idle');
    expect(pipButton).toHaveTextContent('');
    expect(screen.queryByText('PiP')).not.toBeInTheDocument();
    fireEvent.click(pipButton);
    expect(windPipMock.toggle).toHaveBeenCalledTimes(1);
  });

  it('cycles the existing single button through off, compass, GNSS, and off', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    const offButton = screen.getByRole('button', { name: 'コンパスをオンにする' });
    expect(offButton).toHaveAttribute('data-wind-reference-mode', 'off');
    expect(document.querySelectorAll('.wind-rose-corner-action-left')).toHaveLength(1);

    fireEvent.click(offButton);
    const compassButton = screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    });
    expect(compassButton).toHaveAttribute('data-wind-reference-mode', 'compass');
    expect(compassButton).toHaveAttribute('data-control-tone', 'accent');

    fireEvent.click(compassButton);
    const gnssButton = screen.getByRole('button', {
      name: /コンパスとGNSS補正をオフにする/,
    });
    expect(gnssButton).toHaveAttribute('data-wind-reference-mode', 'gnss');
    expect(gnssButton).toHaveAttribute('data-control-tone', 'success');
    expect(gnssButton).toHaveClass('gnss');
    expect(document.querySelectorAll('.wind-rose-corner-action-left')).toHaveLength(1);

    fireEvent.click(gnssButton);
    expect(screen.getByRole('button', { name: 'コンパスをオンにする' }))
      .toHaveAttribute('data-wind-reference-mode', 'off');
  });

  it('shows GNSS ground speed first and toggles the upper metric to true-north direction', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    }));

    const gauge = screen.getByTestId('wind-rose-gauge');
    expect(gauge).toHaveAttribute('data-center-primary-metric', 'groundSpeed');
    expect(gauge).toHaveAttribute('data-ground-speed-mps', '5');

    const metricToggle = screen.getByRole('button', {
      name: '移動速度から風向表示に切り替える',
    });
    expect(metricToggle).toHaveClass('wind-rose-primary-metric-hit-target');
    fireEvent.click(metricToggle);

    expect(gauge).toHaveAttribute('data-center-primary-metric', 'windDirection');
    expect(screen.getByRole('button', {
      name: '風向から移動速度表示に切り替える',
    })).toBeInTheDocument();
  });

  it('keeps the three-state control and native API absent outside Capacitor iOS', () => {
    nativeHeadingCapabilityMock.available = false;
    render(<WindRoseGaugeSlide {...createProps()} />);

    expect(screen.queryByRole('button', { name: 'コンパスをオンにする' }))
      .not.toBeInTheDocument();
    expect(document.querySelectorAll('.wind-rose-corner-action-left')).toHaveLength(0);
  });

  it('applies GNSS true wind only to the radial gauge while PiP keeps raw ULSA values', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    }));

    const expected = calculateTrueWind({
      apparentSpeedMps: 2.34,
      apparentDirectionFromDeviceDegrees: 73,
      deviceTrueHeadingDegrees: 128,
      platformSpeedMps: 5,
      platformCourseDegrees: 85,
    });
    const gauge = screen.getByTestId('wind-rose-gauge');
    expect(gauge).toHaveAttribute('data-direction-reference', 'trueWind');
    expect(Number(gauge.getAttribute('data-speed'))).toBeCloseTo(expected!.speedMps, 8);
    expect(Number(gauge.getAttribute('data-direction')))
      .toBeCloseTo(expected!.directionFromDeviceDegrees!, 8);
    expect(gauge).toHaveAttribute('data-has-wind-direction', 'true');
    expect(windPipMock.options).toEqual(expect.objectContaining({
      windSpeed: 2.34,
      windDirection: 73,
    }));
  });

  it('shows GNSS waiting without presenting an unqualified true-wind hold', () => {
    navigationMock.state.gnssAssessment = {
      status: 'lowAccuracy',
      usable: false,
      platformSpeedMps: 0,
      platformCourseDegrees: null,
      reason: 'GNSS速度の精度が不足しています',
    };
    render(<WindRoseGaugeSlide {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    }));

    expect(screen.getByTestId('wind-rose-gauge'))
      .toHaveAttribute('data-direction-reference', 'gnssPending');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-speed', '2.34');
    expect(screen.getByRole('button', { name: /コンパスとGNSS補正をオフにする/ }))
      .toHaveAttribute('data-control-tone', 'warning');
    expect(screen.getByRole('status')).toHaveTextContent('GNSS速度の精度が不足しています');
    expect(screen.getAllByRole('button', { name: /現在の風向風速を保存/ }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ disabled: true }),
      ]));
  });

  it('keeps GNSS true-wind active when compass accuracy is low', () => {
    navigationMock.state.status = 'lowAccuracy';
    navigationMock.state.headingAccuracy = 38;
    render(<WindRoseGaugeSlide {...createProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    }));

    expect(screen.getByTestId('wind-rose-gauge'))
      .toHaveAttribute('data-direction-reference', 'trueWind');
    expect(screen.getByTestId('wind-rose-gauge'))
      .toHaveAttribute('data-heading-accuracy', '38');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /現在GNSS補正中/ }))
      .toHaveAttribute('data-control-tone', 'success');
  });

  it('renders a valid zero true-wind speed with an undefined direction', () => {
    navigationMock.state.gnssAssessment = {
      status: 'ready',
      usable: true,
      platformSpeedMps: 10,
      platformCourseDegrees: 128,
      reason: null,
    };
    render(<WindRoseGaugeSlide {...createProps({
      windSpeed: 10,
      windDirectionContinuous: 0,
    })} />);
    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    }));

    const gauge = screen.getByTestId('wind-rose-gauge');
    expect(gauge).toHaveAttribute('data-speed', '0');
    expect(gauge).toHaveAttribute('data-has-wind-direction', 'false');
    expect(gauge).toHaveAttribute('data-direction-reference', 'trueWind');
  });

  it('disables PiP start until a fresh real sensor value is available', () => {
    windPipMock.canStart = false;
    render(<WindRoseGaugeSlide {...createProps({ dataState: 'stale' })} />);

    expect(screen.getByRole('button', { name: 'ピクチャーインピクチャーを開始' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ピクチャーインピクチャーを開始' })).toHaveAttribute('data-control-interaction', 'disabled');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-has-wind-data', 'false');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-direction', '0');
    windPipMock.canStart = true;
  });

  it('shows the PiP icon active state without adding a text label', () => {
    windPipMock.active = true;
    render(<WindRoseGaugeSlide {...createProps()} />);

    const pipButton = screen.getByRole('button', { name: 'ピクチャーインピクチャーを停止' });
    expect(pipButton).toHaveClass('active');
    expect(pipButton).toHaveAttribute('aria-pressed', 'true');
    expect(pipButton).toHaveTextContent('');
    windPipMock.active = false;
  });

  it('does not render the PiP control when the native iOS capability is unavailable', () => {
    windPipMock.available = false;
    render(<WindRoseGaugeSlide {...createProps()} />);

    expect(screen.queryByRole('button', { name: 'ピクチャーインピクチャーを開始' })).not.toBeInTheDocument();
    windPipMock.available = true;
  });

  it('renders a continuous automatic gauge without manual sensitivity buttons', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    expect(screen.getByTestId('wind-rose-gauge')).toBeInTheDocument();
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-tilted', 'true');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-tilt-degrees', '50');
    expect(screen.queryByRole('button', { name: 'バー感度を 0.5 m/s に変更' })).not.toBeInTheDocument();
    expect(screen.queryByText('WIND VECTOR')).not.toBeInTheDocument();
    expect(screen.queryByText('バーの伸びはセンサーの風速（m/s）に合わせて変化します。')).not.toBeInTheDocument();
  });

  it('uses the 50-degree depth view by default while keeping its controls hidden', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-tilted', 'true');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-tilt-degrees', '50');
    expect(screen.queryByRole('button', { name: '奥行き表示をオフにする' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '奥行き角度 標準 50度' })).not.toBeInTheDocument();
  });

  it('passes only real dashboard values and becomes inactive offscreen', () => {
    const { rerender } = render(<WindRoseGaugeSlide {...createProps({ isActive: false, windSpeed: null })} />);

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-speed', 'null');

    rerender(<WindRoseGaugeSlide {...createProps({ windSpeed: 1.25, windDirectionContinuous: 270 })} />);

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-speed', '1.25');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-direction', '270');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-sample-timestamp', '123456');
  });

  it('keeps the native PiP snapshot current while the carousel slide is inactive', () => {
    const { rerender } = render(<WindRoseGaugeSlide {...createProps({
      isActive: false,
      windSpeed: 1.2,
      cardLogState: 'ready',
    })} />);

    rerender(<WindRoseGaugeSlide {...createProps({
      isActive: false,
      windSpeed: 2.8,
      windDirectionContinuous: 211,
      temperature: 26.3,
      soundSpeed: 348.1,
      headingSpeed: 0.81,
      windSpeedAverage10m: 2.17,
      cardLogState: 'error',
      cardLogDetail: 'FILE異常',
      appLogState: 'recording',
    })} />);

    expect(windPipMock.options).toEqual(expect.objectContaining({
      windSpeed: 2.8,
      windDirection: 211,
      temperature: 26.3,
      soundSpeed: 348.1,
      headingSpeed: 0.81,
      windSpeedAverage10m: 2.17,
      cardLogState: 'error',
      cardLogDetail: 'FILE異常',
      appLogState: 'recording',
    }));
  });

  it('passes the current theme contrast mode to the canvas', () => {
    render(<WindRoseGaugeSlide {...createProps({ themeVariant: 'light' })} />);

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-theme-variant', 'light');
  });

  it('cycles the shared wind-speed unit from the unit-only hit target', () => {
    const onUnitCycle = vi.fn();
    render(<WindRoseGaugeSlide {...createProps({ onUnitCycle })} />);

    const unitTarget = screen.getByRole('button', { name: '風速単位を変更。現在 m/s' });
    expect(unitTarget).toHaveClass('wind-rose-unit-hit-target');
    expect(unitTarget).toHaveTextContent('');
    expect(screen.queryByText('単位')).not.toBeInTheDocument();
    fireEvent.click(unitTarget);
    expect(onUnitCycle).toHaveBeenCalledTimes(1);
  });

  it('keeps a distinct visual identity for all three peak-hold banks', () => {
    render(<WindRoseGaugeSlide {...createProps({ themeVariant: 'graphite' })} />);

    const banks = [1, 2, 3].map((bank) => document.querySelector(
      `[data-peak-hold-bank="${bank}"]`,
    ) as HTMLElement);
    expect(banks.map((bank) => bank.style.getPropertyValue('--wind-rose-peak-active-text')))
      .toEqual(['#FFB547', '#7FE58A', '#FF7FAF']);
    expect(new Set(banks.map((bank) => (
      bank.style.getPropertyValue('--wind-rose-peak-muted-text')
    ))).size).toBe(1);
    expect(document.querySelectorAll('.wind-rose-peak-hold-title svg')).toHaveLength(0);
  });

  it('shows only the centered hold label before a snapshot is captured', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    for (const bank of [1, 2, 3]) {
      const button = document.querySelector(
        `[data-peak-hold-bank="${bank}"] .wind-rose-peak-hold-capture`,
      );
      expect(button).toHaveTextContent(`HOLD ${bank}`);
      expect(button?.textContent?.trim()).toBe(`HOLD ${bank}`);
    }
    expect(document.querySelectorAll('.wind-rose-peak-hold-empty')).toHaveLength(0);
  });

  it('captures, updates, and individually clears three peak-hold snapshots', () => {
    const onUnitCycle = vi.fn();
    const { rerender } = render(<WindRoseGaugeSlide {...createProps({ onUnitCycle })} />);

    expect(screen.getAllByRole('button', { name: /現在の風向風速を保存/ })).toHaveLength(3);
    fireEvent.click(screen.getByTestId('wind-rose-gauge'));
    fireEvent.click(screen.getByRole('button', { name: 'ピークホールド1に現在の風向風速を保存' }));

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-count', '1');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-banks', '0');
    expect(screen.getByText('74°')).toBeInTheDocument();
    expect(screen.getByText('2.34')).toBeInTheDocument();
    expect(screen.getByText('m/s')).toHaveClass('wind-rose-peak-hold-unit');
    expect(screen.getByRole('button', { name: 'ピークホールド1を解除' })).toBeInTheDocument();
    expect(screen.queryByText('真北基準')).not.toBeInTheDocument();

    rerender(<WindRoseGaugeSlide {...createProps({ onUnitCycle, windSpeedUnit: 'km/h' })} />);
    expect(screen.getByText('8.4')).toBeInTheDocument();
    expect(screen.getByText('km/h')).toHaveClass('wind-rose-peak-hold-unit');

    fireEvent.click(screen.getByTestId('wind-rose-gauge'));
    fireEvent.click(screen.getByRole('button', { name: 'ピークホールド2に現在の風向風速を保存' }));
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-count', '2');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-banks', '0,1');

    fireEvent.click(screen.getByRole('button', { name: 'ピークホールド1を解除' }));
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-count', '1');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-banks', '1');
    expect(screen.getByRole('button', { name: 'ピークホールド1に現在の風向風速を保存' })).toBeInTheDocument();
  });

  it('marks a held direction as true-north referenced when captured with compass correction', () => {
    render(<WindRoseGaugeSlide {...createProps()} />);

    fireEvent.click(screen.getByRole('button', { name: 'コンパスをオンにする' }));
    fireEvent.click(screen.getByTestId('wind-rose-gauge'));
    fireEvent.click(screen.getByRole('button', { name: 'ピークホールド1に現在の風向風速を保存' }));

    expect(screen.getByText('真北基準')).toHaveClass('wind-rose-peak-hold-reference');
    expect(screen.getByText('真北基準').closest('.wind-rose-peak-hold-slot')).toHaveClass('has-reference');
    expect(screen.getByRole('button', {
      name: /ピークホールド1。真北基準、74度、2\.34 m\/s。現在の風向風速で更新/,
    })).toBeInTheDocument();
  });

  it('keeps saved peak holds visible but blocks new captures without live wind data', () => {
    const { rerender } = render(<WindRoseGaugeSlide {...createProps()} />);

    fireEvent.click(screen.getByTestId('wind-rose-gauge'));
    fireEvent.click(screen.getByRole('button', { name: 'ピークホールド1に現在の風向風速を保存' }));
    rerender(<WindRoseGaugeSlide {...createProps({ isUlsaConnected: false, dataState: 'disconnected' })} />);

    expect(screen.getByRole('button', { name: /ピークホールド1。.*現在の風向風速で更新/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ピークホールド2に現在の風向風速を保存' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'ピークホールド1を解除' })).toBeEnabled();
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-peak-hold-count', '1');
  });

  it('keeps the iPhone compass rotating while disconnected without drawing a stale ULSA direction', () => {
    render(<WindRoseGaugeSlide {...createProps({ isUlsaConnected: false })} />);

    const compassButton = screen.getByRole('button', { name: 'コンパスをオンにする' });
    expect(compassButton).toHaveClass('wind-rose-corner-action-left');
    expect(compassButton).toHaveTextContent('');
    fireEvent.click(compassButton);

    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-has-wind-data', 'false');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-direction', '0');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-true-heading', '128');
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAttribute('data-heading-accuracy', '3');
    expect(screen.getByRole('button', {
      name: 'コンパスからGNSS補正モードに切り替える',
    })).toHaveClass('active');
    expect(screen.queryByText(/真北|精度不良/)).not.toBeInTheDocument();
  });

});
