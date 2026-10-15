import { cleanup, fireEvent, render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense, startTransition, useState } from 'react';
import WindRoseGauge from './WindRoseGauge';
import { useDashboardOrientationFlip } from '../../pages/dashboard/useDashboardOrientationFlip';

const drawMocks = vi.hoisted(() => ({ draw: vi.fn(), staticLayer: vi.fn() }));
const motionTestControl = vi.hoisted(() => ({ useRealModel: false }));
vi.mock('./windRoseCanvasRenderer', () => ({
  drawWindRoseCanvas: drawMocks.draw,
  drawWindRoseStaticLayer: drawMocks.staticLayer,
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
}));
vi.mock('./windRoseMotionModel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./windRoseMotionModel')>();
  return {
    WindRoseMotionModel: class extends actual.WindRoseMotionModel {
      advance(nowMs: number) {
        if (motionTestControl.useRealModel) return super.advance(nowMs);
        const rayActivity = new Float32Array(120);
        rayActivity[0] = 1;
        return {
          speedMps: 3, normalizedSpeed: 0.5, peakDirectionDegrees: 0,
          angularVelocityDegreesPerSecond: 0, movementDirection: 0 as const,
          rayActivity, needsAnimation: false,
        };
      }
    },
  };
});

const gaugeProps = {
  windSpeed: 3, windSpeedUnit: 'm/s' as const, windDirectionContinuous: 0,
  trueHeading: 0, headingAccuracy: null, isTilted: false,
  peakHolds: [],
};

let now = 0;
let frameId = 0;
let queuedFrames: Map<number, FrameRequestCallback>;
const flushFrame = (timestamp: number) => {
  now = timestamp;
  const callbacks = [...queuedFrames.values()];
  queuedFrames.clear();
  act(() => callbacks.forEach(callback => callback(timestamp)));
};

describe('WindRoseGauge orientation commit', () => {
  beforeEach(() => {
    motionTestControl.useRealModel = false;
    now = 0;
    frameId = 0;
    queuedFrames = new Map();
    drawMocks.draw.mockClear();
    drawMocks.staticLayer.mockClear();
    delete window.__ULSA_NATIVE_DEVICE_ORIENTATION;
    delete window.__ULSA_NATIVE_SCREEN_METRICS;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      queuedFrames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { queuedFrames.delete(id); });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 400,
      width: 400, height: 400, toJSON: () => ({}),
    });
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
  });

  afterEach(() => {
    cleanup();
    document.querySelectorAll('ion-app').forEach(element => element.remove());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: false };
  });

  it('ignores physical device orientation on Mac without rotating the measured wind', () => {
    window.__ULSA_NATIVE_RUNTIME = { isIOSAppOnMac: true };
    window.__ULSA_NATIVE_DEVICE_ORIENTATION = { upsideDown: true };
    window.__ULSA_NATIVE_SCREEN_METRICS = { interfaceRotationDegrees: 180 };
    const ionApp = document.createElement('ion-app');
    document.body.appendChild(ionApp);
    const Harness = () => {
      const { compassScreenRotationDegrees } = useDashboardOrientationFlip();
      return <WindRoseGauge {...gaugeProps} trueHeading={null} screenRotationDegrees={compassScreenRotationDegrees} />;
    };
    render(<Harness />);
    flushFrame(0);
    expect(ionApp).not.toHaveClass('app-manual-upside-down');
    expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(0);
    fireEvent(window, new CustomEvent('ulsaNativeDeviceOrientation', { detail: { upsideDown: true } }));
    expect(ionApp).not.toHaveClass('app-manual-upside-down');
  });

  it('draws a rotation immediately even inside the ordinary 30fps throttle window', () => {
    const { rerender } = render(<WindRoseGauge {...gaugeProps} screenRotationDegrees={0} />);
    flushFrame(0);
    drawMocks.draw.mockClear();
    now = 1;
    rerender(<WindRoseGauge {...gaugeProps} screenRotationDegrees={180} />);
    expect(drawMocks.draw).toHaveBeenCalledTimes(1);
    expect(drawMocks.draw.mock.calls[0][1].screenRotationDegrees).toBe(180);
    expect(queuedFrames.size).toBe(0);

    drawMocks.draw.mockClear();
    rerender(<WindRoseGauge {...gaugeProps} trueHeading={10} screenRotationDegrees={180} />);
    flushFrame(2);
    expect(drawMocks.draw).not.toHaveBeenCalled();
    flushFrame(35);
    expect(drawMocks.draw).toHaveBeenCalledTimes(1);
  });

  it('commits rapid back-and-forth flips without waiting for another animation frame', () => {
    const { rerender } = render(<WindRoseGauge {...gaugeProps} screenRotationDegrees={0} />);
    flushFrame(0);
    now = 1;
    for (const rotation of [180, 0, 90, 270, 180]) {
      drawMocks.draw.mockClear();
      rerender(<WindRoseGauge {...gaugeProps} screenRotationDegrees={rotation} />);
      expect(drawMocks.draw).toHaveBeenCalledTimes(1);
      expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(rotation);
      expect(queuedFrames.size).toBe(0);
    }
  });

  it('does no canvas work or scheduling for rotations while hidden', () => {
    const { rerender } = render(<WindRoseGauge {...gaugeProps} screenRotationDegrees={0} />);
    flushFrame(0);
    drawMocks.draw.mockClear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    fireEvent(document, new Event('visibilitychange'));
    rerender(<WindRoseGauge {...gaugeProps} screenRotationDegrees={180} />);
    expect(drawMocks.draw).not.toHaveBeenCalled();
    expect(queuedFrames.size).toBe(0);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    fireEvent(document, new Event('visibilitychange'));
    flushFrame(1);
    expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(180);
  });

  it('redraws the correct orientation when an inactive gauge becomes visible', () => {
    const { rerender } = render(<WindRoseGauge {...gaugeProps} isActive={false} screenRotationDegrees={0} />);
    rerender(<WindRoseGauge {...gaugeProps} isActive={false} screenRotationDegrees={180} />);
    expect(drawMocks.draw).not.toHaveBeenCalled();
    expect(queuedFrames.size).toBe(0);
    rerender(<WindRoseGauge {...gaugeProps} isActive screenRotationDegrees={180} />);
    expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(180);
  });

  it('updates the canvas before the parent applies the new CSS flip', () => {
    const ionApp = document.createElement('ion-app');
    document.body.appendChild(ionApp);
    const Harness = () => {
      const { compassScreenRotationDegrees, toggleFlip } = useDashboardOrientationFlip();
      return <>
        <button type="button" onClick={toggleFlip}>flip</button>
        <WindRoseGauge {...gaugeProps} screenRotationDegrees={compassScreenRotationDegrees} />
      </>;
    };
    render(<Harness />, { container: ionApp });
    flushFrame(0);
    const applyClass = ionApp.classList.toggle.bind(ionApp.classList);
    vi.spyOn(ionApp.classList, 'toggle').mockImplementation((token, force) => {
      if (token === 'app-manual-upside-down' && force) {
        expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(180);
      }
      return applyClass(token, force);
    });
    now = 1;
    fireEvent.click(screen.getByRole('button', { name: 'flip' }));
    expect(ionApp).toHaveClass('app-manual-upside-down');
  });

  it('keeps RAF drawing committed orientation when a concurrent rotation render suspends', async () => {
    const suspended = vi.fn();
    const pending = new Promise<void>(() => {});
    const BlockCommit = ({ blocked }: { blocked: boolean }) => {
      suspended(blocked);
      if (blocked) throw pending;
      return null;
    };
    const Harness = () => {
      const [rotation, setRotation] = useState(0);
      return <>
        <button type="button" onClick={() => startTransition(() => setRotation(180))}>defer flip</button>
        <Suspense fallback={<span>pending rotation</span>}>
          <WindRoseGauge {...gaugeProps} screenRotationDegrees={rotation} />
          <BlockCommit blocked={rotation === 180} />
        </Suspense>
      </>;
    };
    render(<Harness />);
    flushFrame(0);
    drawMocks.draw.mockClear();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'defer flip' })));
    expect(suspended).toHaveBeenCalledWith(true);
    expect(screen.queryByText('pending rotation')).not.toBeInTheDocument();
    flushFrame(35);
    expect(drawMocks.draw.mock.lastCall?.[1].screenRotationDegrees).toBe(0);
  });

  it('records the captured geographic reference rotation, not only its numeric bearing', () => {
    const capture = vi.fn();
    render(<WindRoseGauge {...gaugeProps} trueHeading={73.5} onPeakHoldFrameChange={capture} />);
    flushFrame(0);
    expect(capture.mock.lastCall?.[0]).toMatchObject({
      displayDirectionDegrees: 73.5,
      displayRotationDegrees: 73.5,
      directionReference: 'trueNorth',
    });
  });

  it('commits a north wind in the current screen basis even for the same BLE packet', () => {
    motionTestControl.useRealModel = true;
    const capture = vi.fn();
    const samePacket = {
      ...gaugeProps, sampleTimestampMs: 1_000, onPeakHoldFrameChange: capture,
    };
    const { rerender } = render(
      <WindRoseGauge {...samePacket} windReferenceRotationDegrees={0} screenRotationDegrees={0} />,
    );
    flushFrame(500);
    expect(capture.mock.lastCall?.[0]).toMatchObject({
      displayDirectionDegrees: 0, displayRotationDegrees: 0,
    });
    expect(drawMocks.draw.mock.lastCall?.[1].frame.peakDirectionDegrees).toBe(0);

    // Both phone layouts keep ULSA zero on the visible near-to-far axis. The
    // connector-up screen basis is 180 degrees from the physical phone top;
    // raw data stays unchanged, but its hardware-frame conversion must update.
    now = 501;
    drawMocks.draw.mockClear();
    rerender(<WindRoseGauge {...samePacket}
      windDirectionContinuous={180} trueHeading={180}
      windReferenceRotationDegrees={180} screenRotationDegrees={180}
    />);
    expect(drawMocks.draw).toHaveBeenCalledTimes(1);
    expect(drawMocks.draw.mock.lastCall?.[1].frame.peakDirectionDegrees).toBe(180);
    expect(capture.mock.lastCall?.[0]).toMatchObject({
      displayDirectionDegrees: 0, displayRotationDegrees: 180,
    });
    expect(screen.getByTestId('wind-rose-gauge')).toHaveAccessibleName(/中央上段 風向 0 度/);
    flushFrame(535);
    const reversed = drawMocks.draw.mock.lastCall?.[1];
    const reverseRays = Array.from(reversed.frame.rayActivity as Float32Array);
    expect(reverseRays.indexOf(Math.max(...reverseRays))).toBe(60);
    expect(reversed.screenRotationDegrees).toBe(180);

    now = 536;
    drawMocks.draw.mockClear();
    rerender(<WindRoseGauge {...samePacket}
      windReferenceRotationDegrees={0} screenRotationDegrees={0}
    />);
    expect(drawMocks.draw).toHaveBeenCalledTimes(1);
    expect(drawMocks.draw.mock.lastCall?.[1].frame.peakDirectionDegrees).toBe(0);
    expect(capture.mock.lastCall?.[0]).toMatchObject({
      displayDirectionDegrees: 0, displayRotationDegrees: 0,
    });
    flushFrame(570);
    const uprightRays = Array.from(
      drawMocks.draw.mock.lastCall?.[1].frame.rayActivity as Float32Array,
    );
    expect(uprightRays.indexOf(Math.max(...uprightRays))).toBe(0);
  });
});
