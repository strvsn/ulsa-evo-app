import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChartSlide from './ChartSlide';
import type { LineChartRef } from '../charts';
import { NumericRingBuffer, RingBuffer } from '../../utils/RingBuffer';
import type { SensorBufferRefs } from '../../types/sensor';
import { DEFAULT_ULSA_THEME_INDEX } from '../../constants/themes';
const chartFullscreenStyles = readFileSync('src/pages/dashboard/dashboard-chart-fullscreen.css', 'utf8');
const lineChartRenderStats = vi.hoisted(() => ({ count: 0 }));
const lineChartImperativeMocks = vi.hoisted(() => ({
    resize: vi.fn(),
    dispose: vi.fn(),
    updateData: vi.fn(),
}));
const resizeObserverMocks = vi.hoisted(() => ({
    callback: undefined as ResizeObserverCallback | undefined,
    observe: vi.fn(),
    disconnect: vi.fn(),
}));
const chartFullscreenMocks = vi.hoisted(() => ({
    enter: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn().mockResolvedValue(undefined),
    isNativeAvailable: vi.fn(() => false),
}));
vi.mock('../../services/chartFullscreen', () => ({
    enterChartFullscreen: chartFullscreenMocks.enter,
    exitChartFullscreen: chartFullscreenMocks.exit,
    isNativeChartFullscreenAvailable: chartFullscreenMocks.isNativeAvailable,
}));
vi.mock('../charts', async () => {
    return {
        DEFAULT_WIND_SPEED_SERIES_VISIBILITY: {
            windSpeed: true,
            windSpeedA: true,
            windSpeedB: true,
        },
        WIND_SPEED_SERIES: [
            { key: 'windSpeed', name: '風速', color: '#0A84FF' },
            { key: 'windSpeedA', name: 'A方向', color: '#FF9F0A' },
            { key: 'windSpeedB', name: 'B方向', color: '#64D2FF' }
        ],
        DEFAULT_TEMPERATURE_SERIES_VISIBILITY: {
            temperature: true,
        },
        TEMPERATURE_SERIES: [
            { key: 'temperature', name: '音仮温度', color: '#FF6B6B' }
        ],
    };
});
vi.mock('../charts/LineChart', async () => {
    const React = await import('react');
    return {
        default: React.forwardRef((props: {
            isActive?: boolean;
            selectedChart: string;
            timeScale: string;
            chartScaleMode: string | number;
            windSpeedSeriesVisibility?: Record<string, boolean>;
            temperatureSeriesVisibility?: Record<string, boolean>;
        }, ref) => {
            lineChartRenderStats.count += 1;
            React.useImperativeHandle(ref, () => lineChartImperativeMocks);
            return (<div data-testid="line-chart" data-active={String(props.isActive)} data-selected-chart={props.selectedChart} data-time-scale={props.timeScale} data-scale-mode={String(props.chartScaleMode)} data-pulse-a12={false} data-pulse-a21={false} data-pulse-b12={false} data-pulse-b21={false} data-wind-speed={String(props.windSpeedSeriesVisibility?.windSpeed)} data-wind-speed-a={String(props.windSpeedSeriesVisibility?.windSpeedA)} data-wind-speed-b={String(props.windSpeedSeriesVisibility?.windSpeedB)} data-temperature={String(props.temperatureSeriesVisibility?.temperature)} data-board-temperature={false}/>);
        }),
    };
});
const createBufferRefs = (): SensorBufferRefs => ({
    windSpeedBufferRef: { current: new NumericRingBuffer(10) },
    windSpeedABufferRef: { current: new NumericRingBuffer(10) },
    windSpeedBBufferRef: { current: new NumericRingBuffer(10) },
    windDirectionBufferRef: { current: new NumericRingBuffer(10) },
    temperatureBufferRef: { current: new NumericRingBuffer(10) },
    soundSpeedBufferRef: { current: new NumericRingBuffer(10) },
    timestampBufferRef: { current: new RingBuffer<string>(10) },
    timestampMsBufferRef: { current: new RingBuffer<number>(10) },
});
const renderChartSlide = (options: {
    isActive: boolean;
    selectedChart?: 'windSpeed' | 'temperature';
}) => {
    const onScaleModeCycle = vi.fn();
    const onTimeScaleChange = vi.fn();
    const onInlineLayoutRestored = vi.fn();
    const view = render(<ChartSlide isActive={options.isActive} selectedChart={options.selectedChart ?? 'windSpeed'} onChartChange={vi.fn()} timeScale="1m" onTimeScaleChange={onTimeScaleChange} chartScaleMode="fixed" onScaleModeCycle={onScaleModeCycle} bufferRefs={createBufferRefs()} lastDebugLogTime={{ current: 0 }} lineChartRef={createRef<LineChartRef>()} themeIndex={DEFAULT_ULSA_THEME_INDEX} onInlineLayoutRestored={onInlineLayoutRestored}/>);
    return { ...view, onScaleModeCycle, onTimeScaleChange, onInlineLayoutRestored };
};
describe('ChartSlide', () => {
    beforeEach(() => {
        vi.unstubAllEnvs();
        lineChartRenderStats.count = 0;
        lineChartImperativeMocks.resize.mockClear();
        lineChartImperativeMocks.dispose.mockClear();
        lineChartImperativeMocks.updateData.mockClear();
        resizeObserverMocks.callback = undefined;
        resizeObserverMocks.observe.mockClear();
        resizeObserverMocks.disconnect.mockClear();
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: ResizeObserverCallback) {
                resizeObserverMocks.callback = callback;
            }
            observe = resizeObserverMocks.observe;
            disconnect = resizeObserverMocks.disconnect;
            unobserve = vi.fn();
        });
        chartFullscreenMocks.enter.mockClear();
        chartFullscreenMocks.exit.mockClear();
        chartFullscreenMocks.isNativeAvailable.mockReturnValue(false);
    });
    it('keeps chart controls visible but skips LineChart while inactive', () => {
        const { container, onScaleModeCycle, onTimeScaleChange } = renderChartSlide({ isActive: false });
        expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
        expect(container.querySelector('.chart-scale-indicator')).toHaveTextContent('縦軸: 標準');
        expect(screen.getByText('音仮温度')).toBeInTheDocument();
        expect(screen.getByText('10s')).toBeInTheDocument();
        expect(screen.getByText('1min')).toHaveClass('active');
        expect(screen.getByText('10m')).toBeInTheDocument();
        fireEvent.click(container.querySelector('.chart-scale-indicator') as HTMLButtonElement);
        fireEvent.click(screen.getByText('10m'));
        expect(onScaleModeCycle).toHaveBeenCalledTimes(1);
        expect(onTimeScaleChange).toHaveBeenCalledWith('10m');
    });
    it('passes active state to LineChart when visible after lazy initialization', async () => {
        const { container } = renderChartSlide({ isActive: true });
        const lineChart = await screen.findByTestId('line-chart');
        expect(lineChart).toHaveAttribute('data-active', 'true');
        expect(lineChart).toHaveAttribute('data-selected-chart', 'windSpeed');
        expect(lineChart).toHaveAttribute('data-time-scale', '1m');
        expect(container.querySelector('.chart-container-slide')).toHaveClass('swiper-no-swiping');
    });
    it('shows only the primary wind-speed series and no legend in the user view', () => {
        renderChartSlide({ isActive: true });
        expect(screen.queryByLabelText('グラフ系列の表示切り替え')).not.toBeInTheDocument();
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-pulse-a12', 'false');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-pulse-a21', 'false');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-wind-speed', 'true');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-wind-speed-a', 'false');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-wind-speed-b', 'false');
    });
    it('shows only the primary temperature series and no legend in the user view', () => {
        renderChartSlide({ isActive: true, selectedChart: 'temperature' });
        expect(screen.queryByLabelText('グラフ系列の表示切り替え')).not.toBeInTheDocument();
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-temperature', 'true');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-board-temperature', 'false');
    });
    it('opens the graph in a fullscreen overlay and restores the card on close', async () => {
        const { onInlineLayoutRestored } = renderChartSlide({ isActive: true });
        fireEvent.click(screen.getByRole('button', { name: 'グラフを全画面表示' }));
        expect(chartFullscreenMocks.enter).toHaveBeenCalledTimes(1);
        expect(await screen.findByRole('dialog', { name: 'グラフ全画面' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '全画面を閉じる' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '全画面を閉じる' }));
        await waitFor(() => {
            expect(chartFullscreenMocks.exit).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('dialog', { name: 'グラフ全画面' })).not.toBeInTheDocument();
            expect(onInlineLayoutRestored).toHaveBeenCalledTimes(1);
        });
    });
    it('focuses and traps the fullscreen dialog, closes on Escape, and restores the trigger', async () => {
        renderChartSlide({ isActive: true });
        const openButton = screen.getByRole('button', { name: 'グラフを全画面表示' });
        openButton.focus();
        fireEvent.click(openButton);
        const dialog = await screen.findByRole('dialog', { name: 'グラフ全画面' });
        const closeButton = within(dialog).getByRole('button', { name: '全画面を閉じる' });
        await waitFor(() => expect(closeButton).toHaveFocus());
        const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>('button, [tabindex]')).filter((element) => element.tabIndex >= 0 && !element.matches(':disabled'));
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];
        lastFocusable.focus();
        fireEvent.keyDown(document, { key: 'Tab' });
        expect(firstFocusable).toHaveFocus();
        firstFocusable.focus();
        fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
        expect(lastFocusable).toHaveFocus();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'グラフ全画面' })).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'グラフを全画面表示' })).toHaveFocus();
        });
        expect(chartFullscreenMocks.exit).toHaveBeenCalledTimes(1);
    });
    it('keeps product graph actions and resize behavior in the fullscreen overlay', async () => {
        renderChartSlide({ isActive: true });
        fireEvent.click(screen.getByRole('button', { name: 'グラフを全画面表示' }));
        const overlay = await screen.findByRole('dialog', { name: 'グラフ全画面' });
        const fullscreenContainer = overlay.querySelector('.chart-container-slide') as HTMLDivElement;
        expect(fullscreenContainer).toBeInTheDocument();
        expect(within(overlay).queryByLabelText('グラフ系列の表示切り替え')).not.toBeInTheDocument();
        expect(within(overlay).getByRole('button', { name: '全画面を閉じる' })).toBeInTheDocument();
        for (const label of ['10s', '1min', '10m'])
            expect(within(overlay).getByText(label)).toBeInTheDocument();
        expect(within(overlay).getByRole('button', { name: /縦軸の表示範囲を変更/ })).toBeInTheDocument();
        expect(resizeObserverMocks.observe).toHaveBeenCalledWith(fullscreenContainer);
        const resizeCount = lineChartImperativeMocks.resize.mock.calls.length;
        act(() => { resizeObserverMocks.callback?.([], {} as ResizeObserver); });
        await waitFor(() => {
            expect(lineChartImperativeMocks.resize.mock.calls.length).toBeGreaterThan(resizeCount);
            expect(lineChartImperativeMocks.updateData.mock.calls.length).toBeGreaterThan(0);
        });
        fireEvent.click(within(overlay).getByRole('button', { name: '全画面を閉じる' }));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'グラフ全画面' })).not.toBeInTheDocument());
    });
    it('overrides the carousel fixed height inside the fullscreen overlay', () => {
        expect(chartFullscreenStyles).toMatch(/\.chart-fullscreen-overlay\s*\{[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s);
        expect(chartFullscreenStyles).toMatch(/\.chart-fullscreen-overlay \.chart-card-slide\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*max-height:\s*100%;/s);
    });
    it('keeps LineChart unmounted while inactive and mounts once when activated', () => {
        const onChartChange = vi.fn();
        const onTimeScaleChange = vi.fn();
        const onScaleModeCycle = vi.fn();
        const bufferRefs = createBufferRefs();
        const lastDebugLogTime = { current: 0 };
        const lineChartRef = createRef<LineChartRef>();
        const stableProps = {
            isActive: false,
            selectedChart: 'windSpeed' as const,
            onChartChange,
            timeScale: '1m' as const,
            onTimeScaleChange,
            chartScaleMode: 'fixed' as const,
            onScaleModeCycle,
            bufferRefs,
            lastDebugLogTime,
            lineChartRef,
            themeIndex: DEFAULT_ULSA_THEME_INDEX,
            onInlineLayoutRestored: vi.fn(),
        };
        const { rerender } = render(<ChartSlide {...stableProps}/>);
        expect(screen.queryByTestId('line-chart')).not.toBeInTheDocument();
        expect(lineChartRenderStats.count).toBe(0);
        rerender(<ChartSlide {...stableProps}/>);
        expect(lineChartRenderStats.count).toBe(0);
        rerender(<ChartSlide {...stableProps} timeScale="10m"/>);
        expect(lineChartRenderStats.count).toBe(0);
        rerender(<ChartSlide {...stableProps} isActive timeScale="10m"/>);
        expect(lineChartRenderStats.count).toBe(1);
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('line-chart')).toHaveAttribute('data-time-scale', '10m');
        rerender(<ChartSlide {...stableProps} isActive timeScale="10m"/>);
        expect(lineChartRenderStats.count).toBe(1);
    });
});
