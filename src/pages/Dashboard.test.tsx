import type { MutableRefObject, PointerEventHandler, ReactNode, RefObject } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { A11y, Keyboard, Navigation, Pagination } from 'swiper/modules';
import Dashboard from './Dashboard';
import { LOG_RECORDING_MODE_STORAGE_KEY } from '../hooks/logging/logRecordingPreferences';
import { WIND_SPEED_UNIT_STORAGE_KEY, type WindSpeedUnit } from '../utils/windSpeedConverter';
interface ResizeOnlyRef {
    resize: () => void;
}
interface LineChartMockRef extends ResizeOnlyRef {
    dispose: () => void;
    updateData: () => void;
}
interface MockSwiper {
    activeIndex: number;
    destroyed: boolean;
    params: {
        touchRatio?: number;
    };
    originalParams: {
        touchRatio?: number;
    };
    slideNext: () => void;
    slidePrev: () => void;
    slideTo: (index: number) => void;
    updateAutoHeight: (speed?: number) => void;
}
interface SwiperMockProps {
    children: ReactNode;
    a11y?: {
        enabled?: boolean;
        containerRole?: string;
        containerRoleDescriptionMessage?: string;
        containerMessage?: string;
        itemRoleDescriptionMessage?: string;
        slideRole?: string;
        slideLabelMessage?: string;
        paginationBulletMessage?: string;
        prevSlideMessage?: string;
        nextSlideMessage?: string;
        firstSlideMessage?: string;
        lastSlideMessage?: string;
    };
    autoHeight?: boolean;
    dir?: string;
    initialSlide?: number;
    keyboard?: {
        enabled?: boolean;
        onlyInViewport?: boolean;
        pageUpDown?: boolean;
    };
    modules?: unknown[];
    pagination?: {
        clickable?: boolean;
        el?: string;
    };
    touchRatio?: number;
    onSwiper?: (swiper: MockSwiper) => void;
    onSlideChange?: (swiper: MockSwiper) => void;
}
type MockSettingsDrawerBridgeProps = {
    isOpen: boolean;
    entryMode?: string;
    isModalActive?: boolean;
    interactionProgress?: number;
    interactionOffsetPx?: number;
    interactionTransitionMs?: number;
    panelGestureHandlers?: {
        onPointerDown: PointerEventHandler<HTMLElement>;
        onPointerMove: PointerEventHandler<HTMLElement>;
        onPointerUp: PointerEventHandler<HTMLElement>;
        onPointerCancel: PointerEventHandler<HTMLElement>;
        onLostPointerCapture: PointerEventHandler<HTMLElement>;
    };
    onDismiss: () => void;
    currentThemeIndex: number;
    onThemeChange: (themeIndex: number) => void;
};
type MockBLEModalProps = {
    isOpen: boolean;
    onDismiss: () => void;
    onScanAndConnect: () => void;
    onConnectToDevice: (device: unknown) => void;
    isContinuousNativeScanActive?: boolean;
};
const assignRef = <T,>(ref: RefObject<T | null> | undefined, value: T | null) => {
    if (!ref)
        return;
    (ref as MutableRefObject<T | null>).current = value;
};
const dashboardMocks = vi.hoisted(() => {
    const scanAndConnect = vi.fn();
    const setCardLogging = vi.fn();
    const useBLE = vi.fn();
    const useSensorData = vi.fn();
    const gaugeResize = vi.fn();
    const lineResize = vi.fn();
    const capacitorIsNativePlatform = vi.fn(() => true);
    const capacitorGetPlatform = vi.fn(() => 'ios');
    const statusCardProps: Array<{
        onClick: () => void;
    }> = [];
    const bleModalProps: MockBLEModalProps[] = [];
    const settingsDrawerBridgeProps: MockSettingsDrawerBridgeProps[] = [];
    const gaugeSlideProps: Array<{
        isActive?: boolean;
        gaugeChartRef?: RefObject<ResizeOnlyRef | null>;
        windSpeedUnit?: WindSpeedUnit;
        onUnitCycle: () => void;
        onMaxChange: (gauge: unknown, value: number) => void;
    }> = [];
    const windRoseGaugeSlideProps: Array<{
        isActive?: boolean;
        dataState?: string;
        temperature?: number | null;
        soundSpeed?: number | null;
        headingSpeed?: number | null;
        windSpeedAverage10m?: number | null;
        cardLogState?: string;
        cardLogDetail?: string;
        appLogState?: string;
        appLogDetail?: string;
        windSpeedUnit?: WindSpeedUnit;
        onUnitCycle?: () => void;
        onRequestActivate?: () => void;
        onPipActivityChange?: (active: boolean) => void;
    }> = [];
    const chartSlideProps: Array<{
        isActive?: boolean;
        lineChartRef?: RefObject<LineChartMockRef | null>;
        onInlineLayoutRestored?: () => void;
    }> = [];
    const swiperProps: SwiperMockProps[] = [];
    return {
        gaugeResize,
        lineResize,
        capacitorGetPlatform,
        capacitorIsNativePlatform,
        scanAndConnect,
        setCardLogging,
        useBLE,
        useSensorData,
        statusCardProps,
        bleModalProps,
        settingsDrawerBridgeProps,
        gaugeSlideProps,
        windRoseGaugeSlideProps,
        chartSlideProps,
        swiperProps,
    };
});
vi.mock('@capacitor/core', () => ({
    Capacitor: {
        getPlatform: dashboardMocks.capacitorGetPlatform,
        isNativePlatform: dashboardMocks.capacitorIsNativePlatform,
    },
}));
vi.mock('@ionic/react', () => ({
    IonContent: ({ children, className, style, }: {
        children: ReactNode;
        className?: string;
        style?: React.CSSProperties;
    }) => (<div data-testid="ion-content" className={className} style={style}>
      {children}
    </div>),
    IonIcon: () => <span data-testid="ion-icon"/>,
    IonPage: ({ children }: {
        children: ReactNode;
    }) => <div data-testid="ion-page">{children}</div>,
}));
vi.mock('swiper/react', () => ({
    Swiper: (props: SwiperMockProps) => {
        dashboardMocks.swiperProps.push(props);
        return <div data-testid="swiper">{props.children}</div>;
    },
    SwiperSlide: ({ children }: {
        children: ReactNode;
    }) => <div data-testid="swiper-slide">{children}</div>,
}));
vi.mock('swiper/modules', () => ({
    A11y: { name: 'A11y' },
    Keyboard: { name: 'Keyboard' },
    Navigation: { name: 'Navigation' },
    Pagination: { name: 'Pagination' },
}));
vi.mock('../hooks/useBLE', () => ({
    useBLE: dashboardMocks.useBLE,
}));
vi.mock('../hooks/useSensorData', () => ({
    useSensorData: dashboardMocks.useSensorData,
}));
vi.mock('../services/browserLog', () => {
    const createStatus = () => ({
        active: false,
        sessionId: null as string | null,
        rowCount: 0,
        segmentCount: 0,
        completedSegmentCount: 0,
        currentSegmentStartedAt: null,
        lastSampleAt: null,
        bufferedBytes: 0,
        storedSessionCount: 0,
        storedSegmentCount: 0,
        storedRowCount: 0,
        storedBytes: 0,
        hasExportableData: false,
        sessions: [],
        retentionDays: 30,
        maxStoredBytes: 100 * 1024 * 1024,
        minFreeBytes: 16 * 1024 * 1024,
        storageRemainingBytes: 100 * 1024 * 1024,
        storageQuotaBytes: null,
        storageUsageBytes: null,
        originRemainingBytes: null,
        effectiveWritableBytes: 100 * 1024 * 1024,
        storageLimitReached: false,
        maintenanceNotice: null,
        error: null,
    });
    class BrowserLogWriter {
        private status = createStatus();
        initialize = vi.fn(async () => this.status);
        appendSample = vi.fn(async () => this.status);
        start = vi.fn(async () => {
            this.status = { ...this.status, active: true, sessionId: 'dashboard-test' };
            return this.status;
        });
        stop = vi.fn(async () => {
            this.status = { ...this.status, active: false };
            return this.status;
        });
        getStatus = vi.fn(() => this.status);
        prepareExport = vi.fn(async () => ({
            file: new File([''], 'logs.zip'),
            createdAt: 1000,
            rawBytes: 0,
            totalRawBytes: 0,
            sessionCount: 0,
            segmentCount: 0,
            scopeSessionId: null,
            batchIndex: 0,
            batchCount: 1,
            plan: { batches: [[]], totalRawBytes: 0 },
        }));
        refreshStorage = vi.fn(async () => this.status);
        deleteSession = vi.fn(async () => this.status);
        deleteAll = vi.fn(async () => this.status);
    }
    return {
        BROWSER_LOG_MAX_STORED_BYTES: 100 * 1024 * 1024,
        BROWSER_LOG_MIN_FREE_BYTES: 16 * 1024 * 1024,
        BROWSER_LOG_RETENTION_DAYS: 30,
        BrowserLogWriter,
        createEmptyBrowserLogStatus: createStatus,
        deliverBrowserLogArchive: vi.fn(async () => 'download'),
    };
});
vi.mock('../components/StatusCard', () => ({
    default: (props: {
        onClick: () => void;
    }) => {
        dashboardMocks.statusCardProps.push(props);
        return <button data-testid="status-card" onClick={props.onClick}>status</button>;
    },
}));
vi.mock('../components/MetricsGrid', () => ({
    default: () => <div data-testid="metrics-grid"/>,
}));
vi.mock('../components/MemoryMonitor', () => ({
    default: () => <div data-testid="memory-monitor"/>,
}));
vi.mock('../components/InitialFirmwareSetupEntry', () => ({
    default: () => <div data-testid="initial-firmware-setup-entry"/>,
}));
vi.mock('../components/BLEModal', () => ({
    default: (props: MockBLEModalProps) => {
        dashboardMocks.bleModalProps.push(props);
        return props.isOpen ? (<div data-testid="ble-modal" data-continuous-scan={String(Boolean(props.isContinuousNativeScanActive))}/>) : null;
    },
}));
vi.mock('../components/BLESettingsDrawerBridge', () => ({
    default: (props: MockSettingsDrawerBridgeProps) => {
        dashboardMocks.settingsDrawerBridgeProps.push(props);
        return props.isOpen ? (<div data-testid="settings-drawer" data-entry-mode={props.entryMode ?? 'animated'} data-modal-active={String(Boolean(props.isModalActive))} data-progress={props.interactionProgress} data-offset={props.interactionOffsetPx} data-transition-ms={props.interactionTransitionMs} {...props.panelGestureHandlers}>
        <button type="button" data-testid="mock-drawer-dismiss" onClick={props.onDismiss}>close</button>
      </div>) : null;
    },
}));
vi.mock('../components/slides', () => ({
    ChartSlide: (props: {
        isActive?: boolean;
        lineChartRef?: RefObject<LineChartMockRef | null>;
        onInlineLayoutRestored?: () => void;
    }) => {
        assignRef(props.lineChartRef, props.isActive
            ? { resize: dashboardMocks.lineResize, dispose: vi.fn(), updateData: vi.fn() }
            : null);
        dashboardMocks.chartSlideProps.push(props);
        return <div data-testid="chart-slide" data-active={String(props.isActive)}/>;
    },
    GaugeSlide: (props: {
        isActive?: boolean;
        gaugeChartRef?: RefObject<ResizeOnlyRef | null>;
        windSpeedUnit?: WindSpeedUnit;
        onUnitCycle: () => void;
        onMaxChange: (gauge: unknown, value: number) => void;
    }) => {
        assignRef(props.gaugeChartRef, props.isActive ? { resize: dashboardMocks.gaugeResize } : null);
        dashboardMocks.gaugeSlideProps.push(props);
        return <div data-testid="gauge-slide" data-active={String(props.isActive)}/>;
    },
    WindRoseGaugeSlide: (props: {
        isActive?: boolean;
        dataState?: string;
        temperature?: number | null;
        soundSpeed?: number | null;
        cardLogState?: string;
        cardLogDetail?: string;
        appLogState?: string;
        appLogDetail?: string;
        windSpeedUnit?: WindSpeedUnit;
        onUnitCycle?: () => void;
        onRequestActivate?: () => void;
        onPipActivityChange?: (active: boolean) => void;
    }) => {
        dashboardMocks.windRoseGaugeSlideProps.push(props);
        return (<div data-testid="wind-rose-gauge-slide" data-active={String(props.isActive)}>
        <input type="checkbox" aria-label="mock compass state"/>
      </div>);
    },
}));
let frameCallbacks: FrameRequestCallback[] = [];
const createMockSwiper = (activeIndex: number): MockSwiper => ({
    activeIndex,
    destroyed: false,
    params: { touchRatio: 1 },
    originalParams: { touchRatio: 1 },
    slideNext: vi.fn(),
    slidePrev: vi.fn(),
    slideTo: vi.fn(),
    updateAutoHeight: vi.fn(),
});
const originalScreenOrientation = window.screen.orientation;
const setMockScreenOrientation = (type: string, angle: number) => {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const orientation = {
        angle,
        type,
        addEventListener: vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
            if (eventName === 'change')
                listeners.add(listener);
        }),
        removeEventListener: vi.fn((eventName: string, listener: EventListenerOrEventListenerObject) => {
            if (eventName === 'change')
                listeners.delete(listener);
        }),
    };
    Object.defineProperty(window.screen, 'orientation', {
        configurable: true,
        value: orientation,
    });
    return {
        dispatchChange() {
            const event = new Event('change');
            listeners.forEach((listener) => {
                if (typeof listener === 'function') {
                    listener(event);
                    return;
                }
                listener.handleEvent(event);
            });
        },
        set(nextType: string, nextAngle: number) {
            orientation.type = nextType;
            orientation.angle = nextAngle;
        },
    };
};
const flushAnimationFrames = () => {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    callbacks.forEach((callback) => callback(performance.now()));
};
const useDrawerFakeTimers = () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
};
const dispatchPointerMouseEvent = (element: Element, type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel', options: MouseEventInit & {
    pointerId?: number;
    pointerType?: string;
    timeStamp?: number;
    isPrimary?: boolean;
}) => {
    const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...options,
    });
    Object.defineProperty(event, 'pointerId', { configurable: true, value: options.pointerId ?? 1 });
    Object.defineProperty(event, 'pointerType', { configurable: true, value: options.pointerType ?? 'touch' });
    Object.defineProperty(event, 'isPrimary', { configurable: true, value: options.isPrimary ?? true });
    if (typeof options.timeStamp === 'number') {
        Object.defineProperty(event, 'timeStamp', { configurable: true, value: options.timeStamp });
    }
    fireEvent(element, event);
};
const stableBufferRefs = {
    windSpeedBufferRef: { current: null },
    windSpeedABufferRef: { current: null },
    windSpeedBBufferRef: { current: null },
    windDirectionBufferRef: { current: null },
    temperatureBufferRef: { current: null },
    soundSpeedBufferRef: { current: null },
    timestampBufferRef: { current: null },
};
const stableLastDebugLogTime = { current: 0 };
const stableDisplayUpdateRef = { current: null };
const readyCardLogControlStatus = {
    protocolVersion: 1,
    lastOpCode: 0,
    lastOp: 'read',
    resultCode: 0,
    result: 'ok',
    cardState: 3,
    flags: 0x05,
    cardAvailable: true,
    loggingEnabled: false,
    canLog: true,
    stopReasonCode: 0,
};
const createBLEState = (overrides = {}) => ({
    availableDevices: [],
    clearError: vi.fn(),
    connectToDevice: vi.fn(),
    connectedDevice: null,
    connectionState: 'disconnected',
    dataState: 'idle',
    identifyDevice: vi.fn(),
    identifyingDeviceId: null,
    deviceHealthLastReadAt: null,
    deviceHealthStatus: null,
    deviceInfo: null,
    deviceModeLastReadAt: null,
    deviceModeNotifyActive: false,
    deviceModeStatus: null,
    disconnect: vi.fn(),
    error: null,
    i2cConfigBusy: false,
    i2cConfigStatus: null,
    i2cConfigSupported: null,
    isSupported: true,
    lastSensorDataAt: null,
    otaControlBusy: false,
    otaControlStatus: null,
    deviceResetBusy: false,
    deviceResetStatus: null,
    deviceResetSupported: null,
    parseErrorStats: { failures: 0, lastError: null },
    platformInfo: null,
    refreshDeviceHealthStatus: vi.fn(),
    refreshDeviceModeStatus: vi.fn(),
    refreshI2cConfigStatus: vi.fn(),
    refreshDeviceResetStatus: vi.fn(),
    refreshOtaControlStatus: vi.fn(),
    refreshRtcTime: vi.fn(),
    refreshCardStatus: vi.fn(),
    refreshSampleMetadataStatus: vi.fn(),
    refreshStm32FirmwareVersion: vi.fn(),
    rtcTimeStatus: {
        deviceTime: null,
        deviceEpochSeconds: null,
        lastReadAt: null,
        lastSyncAt: null,
        lastSyncOffsetMs: null,
        offsetMs: null,
        readError: null,
        supported: null,
        syncMessage: null,
        syncState: 'idle',
        systemTimeAtRead: null,
        zoneId: null,
        zoneName: null,
        totalUtcOffsetMinutes: null,
        standardUtcOffsetMinutes: null,
        dstOffsetMinutes: null,
        tzdbVersion: null,
        rtcDetected: false,
        rtcReadable: false,
        utcValid: false,
        zoneConfigured: false,
        nvsPersisted: false,
        dstActive: false,
        operationGeneration: null,
        lastOperation: 'none',
        lastResult: null,
        operationBusy: false,
        deviceError: false,
    },
    sampleMetadataLastReadAt: null,
    sampleMetadataStatus: null,
    cancelScan: vi.fn(),
    scanAndConnect: dashboardMocks.scanAndConnect,
    cardLogControlBusy: false,
    cardLogControlStatus: null,
    cardLogControlSupported: null,
    cardStatus: null,
    cardStatusLastReadAt: null,
    sensorData: null,
    sensorFieldReceivedAt: {},
    setCardLogging: dashboardMocks.setCardLogging,
    resetDevice: vi.fn(),
    stm32FirmwareVersion: null,
    stm32FirmwareVersionLastReadAt: null,
    syncTime: vi.fn(),
    setRtcTimezone: vi.fn(),
    writeI2cConfig: vi.fn(),
    writeOtaControl: vi.fn(),
    ...overrides,
});
const createSensorValues = (overrides = {}) => ({
    windDirection: null,
    windDirectionContinuous: 0,
    headingSpeed: null,
    windSpeed: null,
    windSpeedAverage10m: null,
    soundSpeed: null,
    temperature: null,
    ...overrides,
});
describe('Dashboard render performance wiring', () => {
    beforeEach(() => {
        window.localStorage.clear();
        frameCallbacks = [];
        dashboardMocks.chartSlideProps.length = 0;
        dashboardMocks.gaugeSlideProps.length = 0;
        dashboardMocks.windRoseGaugeSlideProps.length = 0;
        dashboardMocks.settingsDrawerBridgeProps.length = 0;
        dashboardMocks.statusCardProps.length = 0;
        dashboardMocks.bleModalProps.length = 0;
        dashboardMocks.swiperProps.length = 0;
        dashboardMocks.gaugeResize.mockClear();
        dashboardMocks.lineResize.mockClear();
        dashboardMocks.capacitorIsNativePlatform.mockReturnValue(true);
        dashboardMocks.capacitorGetPlatform.mockReturnValue('ios');
        dashboardMocks.scanAndConnect.mockClear();
        dashboardMocks.setCardLogging.mockClear();
        dashboardMocks.useBLE.mockClear();
        dashboardMocks.useBLE.mockReturnValue(createBLEState());
        dashboardMocks.useSensorData.mockReturnValue({
            bufferRefs: stableBufferRefs,
            displayUpdateRef: stableDisplayUpdateRef,
            lastDebugLogTime: stableLastDebugLogTime,
            values: createSensorValues(),
        });
        vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        }));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        delete (window as Window & {
            __ULSA_NATIVE_DEVICE_ORIENTATION?: unknown;
        }).__ULSA_NATIVE_DEVICE_ORIENTATION;
        delete (window as Window & {
            __ULSA_NATIVE_SCREEN_METRICS?: unknown;
        }).__ULSA_NATIVE_SCREEN_METRICS;
        Reflect.deleteProperty(window, 'orientation');
        Object.defineProperty(window.screen, 'orientation', {
            configurable: true,
            value: originalScreenOrientation,
        });
        document.documentElement.style.removeProperty('--device-screen-corner-radius');
        document.querySelectorAll('ion-app').forEach((element) => element.remove());
    });
    it('enables hidden sensor display commits only while PiP reports activity', () => {
        render(<Dashboard />);
        expect(dashboardMocks.useBLE).toHaveBeenLastCalledWith({
            diagnosticsActive: false,
            backgroundSensorDisplayActive: false,
        });
        act(() => dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onPipActivityChange?.(true));
        expect(dashboardMocks.useBLE).toHaveBeenLastCalledWith({
            diagnosticsActive: false,
            backgroundSensorDisplayActive: true,
        });
        act(() => dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onPipActivityChange?.(false));
        expect(dashboardMocks.useBLE).toHaveBeenLastCalledWith({
            diagnosticsActive: false,
            backgroundSensorDisplayActive: false,
        });
    });
    it('opens the public ULSA EVO landing page from the STRVSN logo', () => {
        render(<Dashboard />);
        const logoLink = screen.getByRole('link', { name: 'STRVSN ULSA EVO 公開サイトを開く' });
        expect(logoLink).toHaveAttribute('href', 'https://ulsa-evo-start.pages.dev/');
        expect(logoLink).toHaveAttribute('target', '_blank');
        expect(logoLink).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
    it('keeps non-sensor handlers stable across live sensor rerenders', () => {
        const { rerender } = render(<Dashboard />);
        const statusClickRef = dashboardMocks.statusCardProps.at(-1)?.onClick;
        const gaugeUnitCycleRef = dashboardMocks.gaugeSlideProps.at(-1)?.onUnitCycle;
        const windRoseUnitCycleRef = dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onUnitCycle;
        const gaugeMaxChangeRef = dashboardMocks.gaugeSlideProps.at(-1)?.onMaxChange;
        dashboardMocks.useSensorData.mockReturnValue({
            bufferRefs: stableBufferRefs,
            displayUpdateRef: stableDisplayUpdateRef,
            lastDebugLogTime: stableLastDebugLogTime,
            values: createSensorValues({
                soundSpeed: 344.1,
                temperature: 24.5,
                windDirection: 45,
                windDirectionContinuous: 45,
                headingSpeed: 0.45,
                windSpeed: 1.23,
                windSpeedAverage10m: 1.11,
            }),
        });
        rerender(<Dashboard />);
        expect(dashboardMocks.statusCardProps.at(-1)?.onClick).toBe(statusClickRef);
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.onUnitCycle).toBe(gaugeUnitCycleRef);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onUnitCycle).toBe(windRoseUnitCycleRef);
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.onMaxChange).toBe(gaugeMaxChangeRef);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)).toEqual(expect.objectContaining({
            headingSpeed: 0.45,
            windSpeedAverage10m: 1.11,
        }));
    });
    it('restores the persisted wind-speed unit for both gauge slides', () => {
        window.localStorage.setItem(WIND_SPEED_UNIT_STORAGE_KEY, 'cm/s');
        render(<Dashboard />);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.windSpeedUnit).toBe('cm/s');
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.windSpeedUnit).toBe('cm/s');
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onUnitCycle)
            .toBe(dashboardMocks.gaugeSlideProps.at(-1)?.onUnitCycle);
    });
    it('persists each unit cycle triggered from either gauge slide', () => {
        render(<Dashboard />);
        act(() => {
            dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onUnitCycle?.();
        });
        expect(window.localStorage.getItem(WIND_SPEED_UNIT_STORAGE_KEY)).toBe('km/h');
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.windSpeedUnit).toBe('km/h');
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.windSpeedUnit).toBe('km/h');
        act(() => {
            dashboardMocks.gaugeSlideProps.at(-1)?.onUnitCycle();
        });
        expect(window.localStorage.getItem(WIND_SPEED_UNIT_STORAGE_KEY)).toBe('cm/s');
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.windSpeedUnit).toBe('cm/s');
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.windSpeedUnit).toBe('cm/s');
    });
    it('falls back to m/s when the persisted unit is invalid', () => {
        window.localStorage.setItem(WIND_SPEED_UNIT_STORAGE_KEY, 'mph');
        render(<Dashboard />);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.windSpeedUnit).toBe('m/s');
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.windSpeedUnit).toBe('m/s');
    });
    it('starts on the radial gauge and places the conventional gauge second', () => {
        render(<Dashboard />);
        const slides = screen.getAllByTestId('swiper-slide');
        expect(within(slides[0]).getByTestId('wind-rose-gauge-slide')).toBeInTheDocument();
        expect(within(slides[1]).getByTestId('gauge-slide')).toBeInTheDocument();
        expect(screen.getByTestId('wind-rose-gauge-slide')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('gauge-slide')).toHaveAttribute('data-active', 'false');
        expect(screen.getByTestId('chart-slide')).toHaveAttribute('data-active', 'false');
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.isActive).toBe(true);
        expect(dashboardMocks.gaugeSlideProps.at(-1)?.isActive).toBe(false);
        expect(dashboardMocks.chartSlideProps.at(-1)?.isActive).toBe(false);
    });
    it('keeps carousel buttons inert before initialization and moves to one explicit target per tap', async () => {
        render(<Dashboard />);
        const nextButton = screen.getByRole('button', { name: '次のカルーセルを表示' });
        expect(nextButton).toBeDisabled();
        const swiper = createMockSwiper(0);
        await act(async () => {
            dashboardMocks.swiperProps.at(-1)?.onSwiper?.(swiper);
        });
        expect(nextButton).not.toBeDisabled();
        fireEvent.click(nextButton);
        expect(swiper.slideTo).toHaveBeenCalledTimes(1);
        expect(swiper.slideTo).toHaveBeenLastCalledWith(1);
        expect(swiper.slideNext).not.toHaveBeenCalled();
        swiper.activeIndex = 1;
        await act(async () => {
            dashboardMocks.swiperProps.at(-1)?.onSlideChange?.(swiper);
        });
        const previousButton = screen.getByRole('button', { name: '前のカルーセルを表示' });
        fireEvent.click(previousButton);
        expect(swiper.slideTo).toHaveBeenLastCalledWith(0);
        expect(swiper.slidePrev).not.toHaveBeenCalled();
    });
    it('configures the dashboard carousel for keyboard and Japanese screen-reader navigation', () => {
        render(<Dashboard />);
        const swiper = dashboardMocks.swiperProps.at(-1);
        expect(swiper?.modules).toEqual([Pagination, Navigation, A11y, Keyboard]);
        expect(swiper?.keyboard).toEqual({
            enabled: true,
            onlyInViewport: true,
            pageUpDown: false,
        });
        expect(swiper?.pagination).toEqual({ clickable: true, el: '.carousel-pagination' });
        expect(swiper?.a11y).toEqual({
            enabled: true,
            containerRole: 'region',
            containerRoleDescriptionMessage: 'カルーセル',
            containerMessage: '計測表示カルーセル',
            itemRoleDescriptionMessage: 'スライド',
            slideRole: 'group',
            slideLabelMessage: '{{slidesLength}}枚中{{index}}枚目',
            paginationBulletMessage: '{{index}}枚目のスライドを表示',
            prevSlideMessage: '前のスライドを表示',
            nextSlideMessage: '次のスライドを表示',
            firstSlideMessage: '最初のスライドです',
            lastSlideMessage: '最後のスライドです',
        });
    });
    it('keeps the product surface focused and places BLE status before measurements', () => {
        render(<Dashboard />);
        const status = screen.getByTestId('status-card');
        const swiper = screen.getByTestId('swiper');
        expect(screen.queryByText('ULSA EVO · LIVE INSTRUMENT')).not.toBeInTheDocument();
        expect(screen.queryByTestId('memory-monitor')).not.toBeInTheDocument();
        expect(status.compareDocumentPosition(swiper) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
    it('persists a settings theme choice and applies the light surface immediately', async () => {
        render(<Dashboard />);
        expect(screen.getByTestId('ion-content')).toHaveClass('light-theme');
        fireEvent.click(screen.getByRole('button', { name: '設定メニューを開く' }));
        expect(await screen.findByTestId('settings-drawer')).toBeInTheDocument();
        expect(dashboardMocks.settingsDrawerBridgeProps.at(-1)?.currentThemeIndex).toBe(7);
        act(() => {
            dashboardMocks.settingsDrawerBridgeProps.at(-1)?.onThemeChange(4);
        });
        expect(screen.getByTestId('ion-content')).toHaveClass('slate-theme');
        expect(dashboardMocks.settingsDrawerBridgeProps.at(-1)?.currentThemeIndex).toBe(4);
        expect(screen.getByTestId('ion-content').getAttribute('style')).toContain('#314956');
        act(() => {
            dashboardMocks.settingsDrawerBridgeProps.at(-1)?.onThemeChange(3);
        });
        expect(screen.getByTestId('ion-content')).toHaveClass('graphite-theme');
        expect(screen.getByTestId('ion-content').getAttribute('style')).toContain('#071019');
        expect(dashboardMocks.settingsDrawerBridgeProps.at(-1)?.currentThemeIndex).toBe(3);
        act(() => {
            dashboardMocks.settingsDrawerBridgeProps.at(-1)?.onThemeChange(7);
        });
        expect(window.localStorage.getItem('ulsa-evo-theme')).toBe('light');
        expect(window.localStorage.getItem('ulsa-evo-theme-index')).toBeNull();
        expect(screen.getByTestId('ion-content')).toHaveClass('light-theme');
        expect(dashboardMocks.settingsDrawerBridgeProps.at(-1)?.currentThemeIndex).toBe(7);
    });
    it('does not force iOS safe-area variables to zero inline', () => {
        render(<Dashboard />);
        const contentStyle = screen.getByTestId('ion-content').getAttribute('style') ?? '';
        expect(contentStyle).toContain('--dashboard-gradient:');
        expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument();
        expect(contentStyle).not.toContain('--ion-safe-area-top: 0px');
        expect(contentStyle).not.toContain('--ion-safe-area-bottom: 0px');
        expect(document.documentElement.style.getPropertyValue('--ion-safe-area-top')).toBe('');
        expect(document.documentElement.style.getPropertyValue('--ion-safe-area-bottom')).toBe('');
    });
    it('marks the recording information card active while log recording is active', () => {
        const { rerender } = render(<Dashboard />);
        expect(screen.getByTestId('log-recording-card')).not.toHaveClass('is-active');
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                cardState: 4,
                flags: 0x07,
                loggingEnabled: true,
            },
        }));
        rerender(<Dashboard />);
        expect(screen.getByTestId('ion-content')).not.toHaveClass('is-log-recording');
        expect(screen.getByTestId('log-recording-card')).toHaveClass('is-active');
    });
    it('prefers fresh card log detail notify over stale control state', () => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                loggingEnabled: false,
            },
            cardLogDetailStatus: {
                protocolVersion: 2,
                flags: 0x07,
                cardAvailable: true,
                loggingEnabled: true,
                canLog: true,
                fileOpen: false,
                rtcTimestamping: false,
                slowWrite: false,
                errorStop: false,
                cardState: 4,
                stopReasonCode: 0,
                logRateHz: 10,
                logCount: 1,
                flushCount: 0,
                bufferedBytes: 20,
                lastWriteDurationMs: 0,
                lastLogAgeSeconds: 0,
            },
        }));
        render(<Dashboard />);
        expect(screen.getByTestId('log-recording-card')).toHaveClass('is-active');
        expect(screen.getByRole('button', { name: 'ログ記録を停止' })).toBeEnabled();
    });
    it('applies native screen corner radius to the app CSS variable', () => {
        (window as Window & {
            __ULSA_NATIVE_SCREEN_METRICS?: {
                screenCornerRadius: number;
                source: string;
            };
        })
            .__ULSA_NATIVE_SCREEN_METRICS = { screenCornerRadius: 47, source: 'test' };
        render(<Dashboard />);
        expect(document.documentElement.style.getPropertyValue('--device-screen-corner-radius')).toBe('47px');
    });
    it('updates the app corner radius from native screen metrics events', () => {
        render(<Dashboard />);
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeScreenMetrics', {
                detail: { screenCornerRadius: 39, source: 'test' },
            }));
        });
        expect(document.documentElement.style.getPropertyValue('--device-screen-corner-radius')).toBe('39px');
    });
    it('toggles manual upside-down mode for Type-C direct connection use', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        const { unmount } = render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        expect(ionApp).toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '画面反転を解除' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '画面反転を解除' }));
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        expect(ionApp).toHaveClass('app-manual-upside-down');
        unmount();
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
    });
    it('flips the app surface from native physical upside-down orientation events', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portraitUpsideDown', upsideDown: true, source: 'test' },
            }));
        });
        expect(ionApp).toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '上下逆さ自動検出中' })).toBeInTheDocument();
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portrait', upsideDown: false, source: 'test' },
            }));
        });
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '画面を上下反転' })).toBeInTheDocument();
    });
    it('ignores native physical orientation events outside Capacitor iOS', () => {
        dashboardMocks.capacitorIsNativePlatform.mockReturnValue(false);
        dashboardMocks.capacitorGetPlatform.mockReturnValue('web');
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portraitUpsideDown', upsideDown: true, source: 'test' },
            }));
        });
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '画面を上下反転' })).toBeInTheDocument();
    });
    it('suppresses manual CSS upside-down mode when the browser already reports reverse portrait', () => {
        dashboardMocks.capacitorIsNativePlatform.mockReturnValue(false);
        dashboardMocks.capacitorGetPlatform.mockReturnValue('web');
        const screenOrientation = setMockScreenOrientation('portrait-secondary', 180);
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        expect(ionApp).not.toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '端末回転を優先中' })).toBeInTheDocument();
        act(() => {
            screenOrientation.set('portrait-primary', 0);
            screenOrientation.dispatchChange();
        });
        expect(ionApp).toHaveClass('app-manual-upside-down');
        expect(screen.getByRole('button', { name: '画面反転を解除' })).toBeInTheDocument();
    });
    it('keeps the swiper layout LTR and inverts touch input while upside-down', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        expect(dashboardMocks.swiperProps.at(-1)?.dir).toBe('ltr');
        expect(dashboardMocks.swiperProps.at(-1)?.touchRatio).toBe(1);
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        expect(ionApp).toHaveClass('app-manual-upside-down');
        expect(dashboardMocks.swiperProps.at(-1)?.dir).toBe('ltr');
        expect(dashboardMocks.swiperProps.at(-1)?.touchRatio).toBe(-1);
    });
    it('inverts swiper touch input during native upside-down orientation', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portraitUpsideDown', upsideDown: true, source: 'test' },
            }));
        });
        expect(ionApp).toHaveClass('app-manual-upside-down');
        expect(dashboardMocks.swiperProps.at(-1)?.dir).toBe('ltr');
        expect(dashboardMocks.swiperProps.at(-1)?.touchRatio).toBe(-1);
    });
    it('updates the live swiper direction without remounting compass and HOLD state', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        const swiper = createMockSwiper(0);
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSwiper?.(swiper);
        });
        fireEvent.click(screen.getByRole('checkbox', { name: 'mock compass state' }));
        expect(screen.getByRole('checkbox', { name: 'mock compass state' })).toBeChecked();
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portraitUpsideDown', upsideDown: true, source: 'test' },
            }));
        });
        expect(screen.getByRole('checkbox', { name: 'mock compass state' })).toBeChecked();
        expect(swiper.params.touchRatio).toBe(-1);
        expect(swiper.originalParams.touchRatio).toBe(-1);
        act(() => {
            window.dispatchEvent(new CustomEvent('ulsaNativeDeviceOrientation', {
                detail: { orientation: 'portrait', upsideDown: false, source: 'test' },
            }));
        });
        expect(screen.getByRole('checkbox', { name: 'mock compass state' })).toBeChecked();
        expect(swiper.params.touchRatio).toBe(1);
        expect(swiper.originalParams.touchRatio).toBe(1);
    });
    it('keeps content-aware carousel height while inverting touch input', () => {
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        expect(dashboardMocks.swiperProps.at(-1)?.autoHeight).toBe(true);
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSlideChange?.(createMockSwiper(1));
        });
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        const flippedSwiperProps = dashboardMocks.swiperProps.at(-1);
        expect(flippedSwiperProps?.autoHeight).toBe(true);
        expect(flippedSwiperProps?.dir).toBe('ltr');
        expect(flippedSwiperProps?.initialSlide).toBe(1);
        expect(flippedSwiperProps?.touchRatio).toBe(-1);
    });
    it('forwards PiP data state and restores the radial gauge slide', () => {
        const staleWindSampleAt = Date.now() - 3001;
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            dataState: 'stale',
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                stopReasonCode: 3,
            },
            cardLogDetailStatus: { stopReasonCode: 3 },
            sensorFieldReceivedAt: {
                windSpeed: staleWindSampleAt,
                windDirection: staleWindSampleAt,
            },
        }));
        dashboardMocks.useSensorData.mockReturnValue({
            bufferRefs: stableBufferRefs,
            displayUpdateRef: {
                current: {
                    latestSample: {} as never,
                    standardFieldReceivedAt: {
                        windSpeed: staleWindSampleAt,
                        windDirection: staleWindSampleAt,
                    },
                    lastStandardReceivedAt: staleWindSampleAt,
                },
            },
            lastDebugLogTime: stableLastDebugLogTime,
            values: createSensorValues({ temperature: 25.4, soundSpeed: 347.2 }),
        });
        render(<Dashboard />);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.dataState).toBe('stale');
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)).toEqual(expect.objectContaining({
            temperature: 25.4,
            soundSpeed: 347.2,
            cardLogState: 'error',
            cardLogDetail: '書込失敗',
            appLogState: 'disabled',
        }));
        const swiper = createMockSwiper(1);
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSwiper?.(swiper);
        });
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSlideChange?.(swiper);
        });
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.isActive).toBe(false);
        act(() => {
            dashboardMocks.windRoseGaugeSlideProps.at(-1)?.onRequestActivate?.();
        });
        expect(swiper.slideTo).toHaveBeenCalledWith(0);
        expect(dashboardMocks.windRoseGaugeSlideProps.at(-1)?.isActive).toBe(true);
    });
    it('resizes only the active slide chart during swiper lifecycle and window resize', () => {
        render(<Dashboard />);
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSwiper?.(createMockSwiper(0));
        });
        act(() => {
            flushAnimationFrames();
        });
        expect(dashboardMocks.gaugeResize).not.toHaveBeenCalled();
        expect(dashboardMocks.lineResize).not.toHaveBeenCalled();
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSlideChange?.(createMockSwiper(1));
        });
        act(() => {
            flushAnimationFrames();
        });
        expect(dashboardMocks.gaugeResize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.lineResize).not.toHaveBeenCalled();
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSlideChange?.(createMockSwiper(2));
        });
        act(() => {
            flushAnimationFrames();
        });
        expect(dashboardMocks.gaugeResize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.lineResize).toHaveBeenCalledTimes(1);
        act(() => {
            window.dispatchEvent(new Event('resize'));
        });
        expect(dashboardMocks.gaugeResize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.lineResize).toHaveBeenCalledTimes(2);
    });
    it('resyncs Swiper auto height after graph fullscreen returns to the iPad window', () => {
        render(<Dashboard />);
        const swiper = createMockSwiper(2);
        act(() => {
            dashboardMocks.swiperProps.at(-1)?.onSwiper?.(swiper);
            flushAnimationFrames();
        });
        vi.mocked(swiper.updateAutoHeight).mockClear();
        act(() => {
            dashboardMocks.chartSlideProps.at(-1)?.onInlineLayoutRestored?.();
            flushAnimationFrames();
        });
        expect(swiper.updateAutoHeight).toHaveBeenCalledWith(0);
    });
    it('loads the BLE modal on first open and keeps its closed host mounted afterward', async () => {
        render(<Dashboard />);
        expect(screen.queryByTestId('ble-modal')).not.toBeInTheDocument();
        expect(dashboardMocks.bleModalProps).toHaveLength(0);
        fireEvent.click(screen.getByTestId('status-card'));
        expect(dashboardMocks.scanAndConnect).toHaveBeenCalledTimes(1);
        expect(await screen.findByTestId('ble-modal')).toBeInTheDocument();
        expect(dashboardMocks.bleModalProps.at(-1)?.isOpen).toBe(true);
    });
    it.each(['scanning', 'connecting'] as const)('opens the existing BLE dialog without restarting the scan while %s', async (connectionState) => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({ connectionState }));
        render(<Dashboard />);
        fireEvent.click(screen.getByTestId('status-card'));
        expect(await screen.findByTestId('ble-modal')).toBeInTheDocument();
        expect(dashboardMocks.scanAndConnect).not.toHaveBeenCalled();
    });
    it('automatically closes a newly initiated BLE connection dialog once connection completes', async () => {
        const { rerender } = render(<Dashboard />);
        fireEvent.click(screen.getByTestId('status-card'));
        expect(await screen.findByTestId('ble-modal')).toBeInTheDocument();
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            connectedDevice: { deviceId: 'device-a', name: 'ULSA EVO #1' },
            dataState: 'waiting',
        }));
        rerender(<Dashboard />);
        expect(screen.queryByTestId('ble-modal')).not.toBeInTheDocument();
        expect(dashboardMocks.bleModalProps.at(-1)?.isOpen).toBe(false);
    });
    it('keeps the カードログ button disabled until BLE カードログging is available', () => {
        const { rerender } = render(<Dashboard />);
        expect(screen.getByRole('button', {
            name: 'BLEデバイスを接続するとログ記録を開始できます',
        })).toBeDisabled();
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                cardState: 1,
                flags: 0x00,
                cardAvailable: false,
                canLog: false,
            },
        }));
        rerender(<Dashboard />);
        const noCardButton = screen.getByRole('button', { name: 'カードが検出されていません' });
        expect(noCardButton).toBeDisabled();
        fireEvent.click(noCardButton);
        expect(dashboardMocks.setCardLogging).not.toHaveBeenCalled();
    });
    it('keeps the app-only log start action disabled before BLE connects', () => {
        window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, 'browser');
        render(<Dashboard />);
        const startButton = screen.getByRole('button', {
            name: 'BLEデバイスを接続するとログ記録を開始できます',
        });
        expect(startButton).toBeDisabled();
        expect(screen.getByTestId('log-recording-destination-browser')).toHaveClass('is-ready');
        expect(screen.getByTestId('log-recording-destination-card')).toHaveClass('is-disabled');
    });
    it('keeps the app-only log start action enabled when the connected card destination is unavailable', () => {
        window.localStorage.setItem(LOG_RECORDING_MODE_STORAGE_KEY, 'browser');
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            dataState: 'waiting',
            cardLogControlSupported: null,
            cardLogControlStatus: null,
        }));
        render(<Dashboard />);
        const startButton = screen.getByRole('button', { name: 'アプリログ記録を開始' });
        expect(startButton).toBeEnabled();
        expect(screen.getByTestId('log-recording-destination-browser')).toHaveClass('is-ready');
        expect(screen.getByTestId('log-recording-destination-card')).toHaveClass('is-disabled');
    });
    it('starts カードログging from the dashboard button when an Card card is ready', async () => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: readyCardLogControlStatus,
        }));
        render(<Dashboard />);
        const startButton = screen.getByRole('button', { name: 'カードログ記録を開始' });
        expect(startButton).toBeEnabled();
        await act(async () => {
            fireEvent.click(startButton);
        });
        expect(dashboardMocks.setCardLogging).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.setCardLogging).toHaveBeenCalledWith(true);
    });
    it('explains why Card start is unavailable in Bridge while retaining the stop path', () => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: readyCardLogControlStatus,
            deviceModeStatus: {
                protocolVersion: 1, modeCode: 3, mode: 'uartBridge', flags: 0,
                phyCode: 0, phy: '1m', bleConnected: true, uartBridgeEnabled: true,
                i2cMeasureActive: false, commandMode: false, bootloaderMode: false,
                wifiPortalActive: false, stm32UpdateActive: false,
            },
        }));
        render(<Dashboard />);
        expect(screen.getByRole('button', {
            name: 'カードログを開始するには本体をI2C計測モードに戻してください',
        })).toBeDisabled();
        expect(screen.getByTestId('log-recording-destination-detail-card'))
            .toHaveTextContent('I2C計測へ戻す');
    });
    it('keeps the Card stop button enabled when the card has failed during recording', async () => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                cardState: 2,
                flags: 0x02,
                cardAvailable: false,
                loggingEnabled: true,
                canLog: false,
                stopReasonCode: 3,
            },
        }));
        render(<Dashboard />);
        const stopButton = screen.getByRole('button', { name: 'ログ記録を停止' });
        expect(stopButton).toBeEnabled();
        await act(async () => {
            fireEvent.click(stopButton);
        });
        expect(dashboardMocks.setCardLogging).toHaveBeenCalledWith(false);
    });
    it('stops カードログging from the dashboard button and blocks duplicate clicks while busy', async () => {
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                cardState: 4,
                flags: 0x07,
                loggingEnabled: true,
            },
        }));
        const { rerender } = render(<Dashboard />);
        const stopButton = screen.getByRole('button', { name: 'ログ記録を停止' });
        expect(stopButton).toBeEnabled();
        await act(async () => {
            fireEvent.click(stopButton);
        });
        expect(dashboardMocks.setCardLogging).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.setCardLogging).toHaveBeenCalledWith(false);
        dashboardMocks.setCardLogging.mockClear();
        dashboardMocks.useBLE.mockReturnValue(createBLEState({
            connectionState: 'connected',
            cardLogControlBusy: true,
            cardLogControlSupported: true,
            cardLogControlStatus: {
                ...readyCardLogControlStatus,
                cardState: 4,
                flags: 0x07,
                loggingEnabled: true,
            },
        }));
        rerender(<Dashboard />);
        const busyButton = screen.getByRole('button', { name: 'カードログ操作中' });
        expect(busyButton).toBeDisabled();
        fireEvent.click(busyButton);
        expect(dashboardMocks.setCardLogging).not.toHaveBeenCalled();
    });
    it('opens the settings drawer after a left-edge pull settles open', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 10,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 370,
            clientY: 228,
            timeStamp: 180,
        });
        await act(async () => {
            flushAnimationFrames();
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        expect(drawer).toHaveAttribute('data-entry-mode', 'interactive');
        expect(Number(drawer.getAttribute('data-progress'))).toBeCloseTo(362 / 390, 3);
        expect(screen.getByTestId('ion-content')).toHaveClass('settings-drawer-open');
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 370,
            clientY: 228,
            timeStamp: 196,
        });
        expect(drawer).toHaveAttribute('data-progress', '1');
        expect(drawer).toHaveAttribute('data-modal-active', 'false');
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-entry-mode', 'settled');
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-modal-active', 'true');
        expect(shell).toHaveAttribute('aria-hidden', 'true');
        expect(shell).toHaveAttribute('inert');
        expect(dashboardMocks.settingsDrawerBridgeProps.at(-1)?.entryMode).toBe('settled');
    });
    it('tracks the real settings drawer with the finger before release', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 0,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 96,
            clientY: 222,
            timeStamp: 120,
        });
        await act(async () => {
            flushAnimationFrames();
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        expect(drawer).toHaveAttribute('data-entry-mode', 'interactive');
        expect(drawer).toHaveAttribute('data-offset', '88');
        expect(Number(drawer.getAttribute('data-progress'))).toBeCloseTo(88 / 390, 3);
        expect(screen.queryByTestId('settings-drawer-swipe-preview')).not.toBeInTheDocument();
        dispatchPointerMouseEvent(shell, 'pointercancel', {
            clientX: 96,
            clientY: 222,
            timeStamp: 160,
        });
        expect(drawer).toHaveAttribute('data-progress', '0');
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('uses the visible left edge and visible rightward pull while upside-down', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        expect(ionApp).toHaveClass('app-manual-upside-down');
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 0,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 96,
            clientY: 222,
            timeStamp: 80,
        });
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 96,
            clientY: 222,
            timeStamp: 96,
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 382,
            clientY: 220,
            timeStamp: 120,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 294,
            clientY: 222,
            timeStamp: 200,
        });
        await act(async () => {
            flushAnimationFrames();
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        expect(drawer).toHaveAttribute('data-offset', '88');
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 294,
            clientY: 222,
            timeStamp: 216,
        });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-entry-mode', 'settled');
    });
    it('settles a short edge pull closed instead of opening the settings drawer', () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 0,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 34,
            clientY: 222,
            timeStamp: 80,
        });
        act(() => flushAnimationFrames());
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-offset', '26');
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 34,
            clientY: 222,
            timeStamp: 120,
        });
        act(() => {
            vi.advanceTimersByTime(300);
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('opens the settings drawer from a short quick native-style edge flick', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 10,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 58,
            clientY: 222,
            timeStamp: 50,
        });
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 88,
            clientY: 222,
            timeStamp: 58,
        });
        await act(async () => {
            flushAnimationFrames();
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '1');
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-entry-mode', 'settled');
    });
    it('does not reuse an early flick after the finger pauses before release', () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            timeStamp: 10,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 100,
            clientY: 222,
            timeStamp: 40,
        });
        act(() => flushAnimationFrames());
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 105,
            clientY: 222,
            timeStamp: 250,
        });
        act(() => flushAnimationFrames());
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 105,
            clientY: 222,
            timeStamp: 380,
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '0');
        act(() => vi.advanceTimersByTime(300));
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('opens from the wider left-side pull zone without snapping back after a committed iOS cancel', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 44,
            clientY: 220,
            timeStamp: 0,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 188,
            clientY: 246,
            timeStamp: 180,
        });
        await act(async () => {
            flushAnimationFrames();
            await Promise.resolve();
        });
        expect(Number(screen.getByTestId('settings-drawer').getAttribute('data-progress'))).toBeCloseTo(144 / 390, 3);
        dispatchPointerMouseEvent(shell, 'pointercancel', {
            clientX: 0,
            clientY: 0,
            timeStamp: 196,
        });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-entry-mode', 'settled');
    });
    it('leaves an edge-originated vertical page gesture alone', () => {
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 120,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 20,
            clientY: 210,
        });
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 20,
            clientY: 210,
        });
        act(() => flushAnimationFrames());
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('does not turn a gesture starting on the menu SVG into an edge swipe', () => {
        render(<Dashboard />);
        const menuButton = screen.getByRole('button', { name: '設定メニューを開く' });
        const iconPath = menuButton.querySelector('path');
        expect(iconPath).not.toBeNull();
        dispatchPointerMouseEvent(iconPath!, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 40,
        });
        dispatchPointerMouseEvent(iconPath!, 'pointermove', {
            buttons: 1,
            clientX: 140,
            clientY: 42,
        });
        dispatchPointerMouseEvent(iconPath!, 'pointerup', {
            clientX: 140,
            clientY: 42,
        });
        act(() => flushAnimationFrames());
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('ignores a non-primary pointer at the screen edge', () => {
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 8,
            clientY: 220,
            isPrimary: false,
            pointerId: 2,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 180,
            clientY: 222,
            isPrimary: false,
            pointerId: 2,
        });
        act(() => flushAnimationFrames());
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('animates the menu button opening and backdrop closing through the same drawer', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        const menuButton = screen.getByRole('button', { name: '設定メニューを開く' });
        fireEvent.click(menuButton);
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '0');
        act(() => flushAnimationFrames());
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '1');
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-transition-ms', '220');
        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });
        expect(menuButton).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-modal-active', 'true');
        fireEvent.click(screen.getByTestId('mock-drawer-dismiss'));
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '1');
        act(() => flushAnimationFrames());
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-progress', '0');
        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
        expect(menuButton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByTestId('dashboard-shell')).not.toHaveAttribute('inert');
    });
    it('closes an open settings drawer with a leftward panel swipe', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '設定メニューを開く' }));
        act(() => flushAnimationFrames());
        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        dispatchPointerMouseEvent(drawer, 'pointerdown', {
            buttons: 1,
            clientX: 300,
            clientY: 120,
            timeStamp: 300,
        });
        dispatchPointerMouseEvent(drawer, 'pointermove', {
            buttons: 1,
            clientX: 120,
            clientY: 124,
            timeStamp: 460,
        });
        act(() => flushAnimationFrames());
        expect(drawer).toHaveAttribute('data-offset', '210');
        dispatchPointerMouseEvent(drawer, 'pointerup', {
            clientX: 120,
            clientY: 124,
            timeStamp: 480,
        });
        expect(drawer).toHaveAttribute('data-progress', '0');
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('snaps an insufficient closing pull back open', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '設定メニューを開く' }));
        act(() => flushAnimationFrames());
        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        dispatchPointerMouseEvent(drawer, 'pointerdown', {
            buttons: 1,
            clientX: 300,
            clientY: 120,
            timeStamp: 300,
        });
        dispatchPointerMouseEvent(drawer, 'pointermove', {
            buttons: 1,
            clientX: 250,
            clientY: 122,
            timeStamp: 420,
        });
        act(() => flushAnimationFrames());
        dispatchPointerMouseEvent(drawer, 'pointerup', {
            clientX: 250,
            clientY: 122,
            timeStamp: 500,
        });
        expect(drawer).toHaveAttribute('data-progress', '1');
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-entry-mode', 'settled');
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-modal-active', 'true');
    });
    it('keeps the visible closing direction correct while upside-down', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('innerWidth', 390);
        const ionApp = document.createElement('ion-app');
        document.body.appendChild(ionApp);
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '画面を上下反転' }));
        fireEvent.click(screen.getByRole('button', { name: '設定メニューを開く' }));
        act(() => flushAnimationFrames());
        await act(async () => {
            vi.advanceTimersByTime(220);
            await Promise.resolve();
        });
        const drawer = screen.getByTestId('settings-drawer');
        dispatchPointerMouseEvent(drawer, 'pointerdown', {
            buttons: 1,
            clientX: 100,
            clientY: 120,
            timeStamp: 300,
        });
        dispatchPointerMouseEvent(drawer, 'pointermove', {
            buttons: 1,
            clientX: 280,
            clientY: 124,
            timeStamp: 460,
        });
        act(() => flushAnimationFrames());
        expect(drawer).toHaveAttribute('data-offset', '210');
        dispatchPointerMouseEvent(drawer, 'pointerup', {
            clientX: 280,
            clientY: 124,
            timeStamp: 480,
        });
        await act(async () => {
            vi.advanceTimersByTime(300);
            await Promise.resolve();
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
    it('shortens programmatic settling when reduced motion is requested', async () => {
        useDrawerFakeTimers();
        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: true,
            media: '(prefers-reduced-motion: reduce)',
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));
        render(<Dashboard />);
        fireEvent.click(screen.getByRole('button', { name: '設定メニューを開く' }));
        act(() => flushAnimationFrames());
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-transition-ms', '60');
        act(() => vi.advanceTimersByTime(59));
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-modal-active', 'false');
        await act(async () => {
            vi.advanceTimersByTime(1);
            await Promise.resolve();
        });
        expect(screen.getByTestId('settings-drawer')).toHaveAttribute('data-modal-active', 'true');
    });
    it('keeps normal page swipes from opening the settings drawer', () => {
        render(<Dashboard />);
        const shell = screen.getByTestId('dashboard-shell');
        dispatchPointerMouseEvent(shell, 'pointerdown', {
            buttons: 1,
            clientX: 80,
            clientY: 220,
        });
        dispatchPointerMouseEvent(shell, 'pointermove', {
            buttons: 1,
            clientX: 160,
            clientY: 225,
        });
        dispatchPointerMouseEvent(shell, 'pointerup', {
            clientX: 160,
            clientY: 225,
        });
        expect(screen.queryByTestId('settings-drawer')).not.toBeInTheDocument();
    });
});
