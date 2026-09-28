import { IonContent, IonPage } from '@ionic/react';
import { lazy, Suspense, useCallback, useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, FlipVertical2, Menu, } from 'lucide-react';
import { useBLE } from '../hooks/useBLE';
import { useLogRecording } from '../hooks/logging/useLogRecording';
import type { SensorDataSource } from '../hooks/useSensorData';
import StatusCard from '../components/StatusCard';
import MetricsGrid from '../components/MetricsGrid';
import { DEFAULT_LANDING_PAGE_URL } from '../config/appInformation';
import { LogRecordingCard } from '../components/LogRecordingCard';
import MemoryMonitor from '../components/MemoryMonitor';
import InitialFirmwareSetupEntry from '../components/InitialFirmwareSetupEntry';
import { ControlIconButton } from '../components/controls';
import { GaugeSlide, WindRoseGaugeSlide, ChartSlide } from '../components/slides';
import { resolveWindRoseDataFreshness } from '../components/charts/windRoseDataFreshness';
import { resolveWindRoseThemeVariant } from '../components/charts/windRoseTheme';
import { type GaugeType, type ChartType, type TimeScale, type GaugeChartRef, type LineChartRef, type ChartScaleMode } from '../components/charts';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperType } from 'swiper';
import { DEFAULT_ULSA_THEME_INDEX, getUlsaThemeIdFromIndex, getUlsaThemeIndex, isUlsaThemeIndex, persistUlsaThemePreference, readUlsaThemePreference, themes, } from '../constants/themes';
import { getNextWindSpeedUnit, readWindSpeedUnitPreference, storeWindSpeedUnitPreference, type WindSpeedUnit, } from '../utils/windSpeedConverter';
import { shouldRenderMemoryMonitor } from './dashboardVisibility';
import { useDashboardOrientationFlip } from './dashboard/useDashboardOrientationFlip';
import { useNativeScreenMetrics } from './dashboard/useNativeScreenMetrics';
import { useSettingsDrawerSwipe } from './dashboard/useSettingsDrawerSwipe';
import { useThemeBackgroundSync } from './dashboard/useThemeBackgroundSync';
import { useBleConnectionModal } from './dashboard/useBleConnectionModal';
import { useBLEBackgroundNotificationPolicy } from './dashboard/useBLEBackgroundNotificationPolicy';
import { updateCarouselAutoHeight, updateSwiperTouchRatio } from './dashboard/swiperRuntime';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import { getNextChartScaleMode } from './dashboard/chartScaleCycle';
import { moveDashboardCarousel } from './dashboard/dashboardCarouselNavigation';
import { CHART_SLIDE_INDEX, GAUGE_SLIDE_INDEX, NOOP_DISPLAY_SUBSCRIPTION, NOOP_SENSOR_NOTIFICATION_TRANSITION, NOOP_TIMELINE_SUBSCRIPTION, SensorDataBoundary, WIND_ROSE_SLIDE_INDEX } from './dashboard/dashboardSensorBoundary';
import { DASHBOARD_SWIPER_A11Y, DASHBOARD_SWIPER_KEYBOARD, DASHBOARD_SWIPER_MODULES } from './dashboard/dashboardSwiperOptions';
import 'swiper/css';
import 'swiper/css/pagination';
import 'swiper/css/navigation';
import './Dashboard.css';
const BLEModal = lazy(() => import('../components/BLEModal'));
const BLESettingsDrawerBridge = lazy(() => import('../components/BLESettingsDrawerBridge'));
const Dashboard: React.FC = () => {
    recordPerfEvent('Dashboard.render');
    useNativeScreenMetrics();
    const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
    const [windPipActivityActive, setWindPipActivityActive] = useState(false);
    const ble = useBLE({ diagnosticsActive: showSettingsDrawer,
        backgroundSensorDisplayActive: windPipActivityActive });
    const bleConnectionState = ble.connectionState;
    const scanAndConnect = ble.scanAndConnect;
    const setCardLoggingOnDevice = ble.setCardLogging;
    const { bleModalPresented, showBLEModal, isContinuousNativeScanActive, handleBLEModalDismiss, handleBleScanAndConnect, handleConnectToBleDevice, handleStatusCardClick, } = useBleConnectionModal({
        connectionState: bleConnectionState,
        availableDevices: ble.availableDevices,
        error: ble.error,
        platformInfo: ble.platformInfo,
        scanAndConnect,
        cancelScan: ble.cancelScan,
        connectToDevice: ble.connectToDevice,
    });
    const commitSettingsDrawerClose = useCallback(() => {
        setShowSettingsDrawer(false);
    }, []);
    const gaugeChartRef = useRef<GaugeChartRef>(null);
    const lineChartRef = useRef<LineChartRef>(null);
    const dataSource: SensorDataSource = ble.connectionState === 'connected'
        ? ble.dataState === 'live'
            ? 'live'
            : ble.dataState === 'stale'
                ? 'stale'
                : 'empty'
        : 'empty';
    const [selectedChart, setSelectedChart] = useState<ChartType>('windSpeed');
    const [selectedGauge, setSelectedGauge] = useState<GaugeType>('windSpeed');
    const [windSpeedUnit, setWindSpeedUnit] = useState<WindSpeedUnit>(readWindSpeedUnitPreference);
    const [swiperInstance, setSwiperInstance] = useState<SwiperType | null>(null);
    const [activeIndex, setActiveIndex] = useState(WIND_ROSE_SLIDE_INDEX);
    const [chartScaleMode, setChartScaleMode] = useState<ChartScaleMode>('fixed');
    const [timeScale, setTimeScale] = useState<TimeScale>('1m');
    const [currentThemeId, setCurrentThemeId] = useState(() => (typeof window === 'undefined'
        ? getUlsaThemeIdFromIndex(DEFAULT_ULSA_THEME_INDEX) ?? 'slate'
        : readUlsaThemePreference(window.localStorage)));
    const currentTheme = getUlsaThemeIndex(currentThemeId);
    const showMemoryMonitor = import.meta.env.VITE_MEMORY_DEBUG === '1';
    const activeIndexRef = useRef(activeIndex);
    const { flipButtonLabel, isUpsideDown, toggleFlip, } = useDashboardOrientationFlip();
    const swiperTouchRatio = isUpsideDown ? -1 : 1;
    const moveCarousel = (offset: -1 | 1) => moveDashboardCarousel(swiperInstance, offset);
    useThemeBackgroundSync({
        gradient: themes[currentTheme].gradient,
        isLight: Boolean(themes[currentTheme].isLight),
        themeId: currentThemeId,
    });
    const handleThemeChange = useCallback((themeIndex: number) => {
        if (!isUlsaThemeIndex(themeIndex))
            return;
        const themeId = getUlsaThemeIdFromIndex(themeIndex);
        if (!themeId)
            return;
        setCurrentThemeId(themeId);
        try {
            persistUlsaThemePreference(window.localStorage, themeId);
        }
        catch { /* Optional cleanup may already have completed. */ }
    }, []);
    useEffect(() => {
        activeIndexRef.current = activeIndex;
    }, [activeIndex]);
    useEffect(() => {
        updateSwiperTouchRatio(swiperInstance, swiperTouchRatio);
    }, [swiperInstance, swiperTouchRatio]);
    const [windSpeedMax, setWindSpeedMax] = useState(5);
    const [temperatureMax, setTemperatureMax] = useState(35);
    const [soundSpeedMax, setSoundSpeedMax] = useState(360);
    const handleMaxChange = useCallback((gauge: GaugeType, value: number) => {
        switch (gauge) {
            case 'windSpeed':
                setWindSpeedMax(value);
                break;
            case 'temperature':
                setTemperatureMax(value);
                break;
            case 'soundSpeed':
                setSoundSpeedMax(value);
                break;
        }
    }, []);
    const handleChartScaleCycle = useCallback(() => {
        setChartScaleMode((previous) => getNextChartScaleMode(selectedChart, previous));
    }, [selectedChart]);
    const handleWindPipRestore = useCallback(() => {
        swiperInstance?.slideTo(WIND_ROSE_SLIDE_INDEX);
        setActiveIndex(WIND_ROSE_SLIDE_INDEX);
    }, [swiperInstance]);
    useEffect(() => {
        setChartScaleMode('fixed');
    }, [selectedChart]);
    const cardAvailable = ble.cardLogDetailStatus?.cardAvailable
        ?? ble.cardLogControlStatus?.cardAvailable
        ?? (ble.cardStatus ? ble.cardStatus.cardState === 3 || ble.cardStatus.cardState === 4 : false);
    const cardLoggingActive = ble.cardLogDetailStatus?.loggingEnabled
        ?? ble.cardLogControlStatus?.loggingEnabled
        ?? (ble.cardStatus ? ble.cardStatus.cardState === 4 : false);
    const cardStopReasonCode = ble.cardLogDetailStatus?.stopReasonCode
        ?? ble.cardLogControlStatus?.stopReasonCode;
    const cardLogErrorActive = [2, 3, 4, 6, 7].includes(cardStopReasonCode ?? -1);
    const cardStartOutsideI2c = ble.deviceModeStatus?.mode === 'command' ||
        ble.deviceModeStatus?.mode === 'uartBridge';
    const cardActivityNotice = ble.cardLogDetailStatus?.recovering ? '復旧中'
        : ble.cardLogDetailStatus?.inputPaused ? '計測待機'
            : ble.cardLogDetailStatus?.recordingRequested === false && ble.cardLogDetailStatus?.quiescent === false
                ? '停止処理中' : !cardLoggingActive && cardStartOutsideI2c ? 'I2C計測へ戻す' : undefined;
    const cardLogButtonDisabled = ble.connectionState !== 'connected' ||
        ble.cardLogControlBusy ||
        ble.cardLogControlSupported !== true ||
        (!cardLoggingActive && (cardStartOutsideI2c || (!cardAvailable && !cardLogErrorActive)));
    const cardLogButtonTitle = ble.connectionState !== 'connected'
        ? 'BLE接続後にカードログを操作できます'
        : ble.cardLogControlBusy
            ? 'カードログ操作中'
            : ble.cardLogControlSupported === false
                ? 'このESP32 firmwareはカードログ制御に対応していません'
                : ble.cardLogControlSupported !== true
                    ? 'カードログ制御状態を取得中'
                    : cardLoggingActive
                        ? 'カードログ記録を停止'
                        : cardStartOutsideI2c
                            ? 'カードログを開始するには本体をI2C計測モードに戻してください'
                            : cardLogErrorActive
                                ? 'カードログ記録を再試行'
                                : !cardAvailable
                                    ? 'カードが検出されていません'
                                    : 'カードログ記録を開始';
    const logRecording = useLogRecording({
        connectionState: ble.connectionState,
        subscribeTimelineSamples: ble.subscribeTimelineSamples ?? NOOP_TIMELINE_SUBSCRIPTION,
        cardLoggingActive,
        cardAvailable,
        cardLogErrorActive,
        cardActivityNotice,
        cardStopReasonCode,
        cardLogOperationBusy: ble.cardLogControlBusy,
        cardLogButtonDisabled,
        cardLogButtonTitle,
        setCardLoggingOnDevice,
    });
    const cardPipLogStatus = logRecording.recordingDestinations.find(({ destination }) => destination === 'card');
    const appPipLogStatus = logRecording.recordingDestinations.find(({ destination }) => destination === 'browser');
    const handleWindPipActivityChange = useCallback((active: boolean) => {
        setWindPipActivityActive(active);
    }, []);
    const maintenanceCritical = ble.deviceResetBusy ||
        ble.i2cConfigBusy ||
        ble.otaControlBusy ||
        ble.stm32UpdateControlBusy ||
        Boolean(ble.otaControlStatus?.portalActive || ble.otaControlStatus?.updating) ||
        Boolean(ble.stm32UpdateControlStatus?.portalActive || ble.stm32UpdateControlStatus?.updating);
    useBLEBackgroundNotificationPolicy({
        connectionState: ble.connectionState,
        appLogActive: appPipLogStatus?.state === 'recording',
        pipActive: windPipActivityActive,
        maintenanceCritical,
        setSensorNotificationsPaused: ble.setSensorNotificationsPaused ?? NOOP_SENSOR_NOTIFICATION_TRANSITION,
    });
    const cycleWindSpeedUnit = useCallback(() => {
        setWindSpeedUnit((previousUnit) => {
            const nextUnit = getNextWindSpeedUnit(previousUnit);
            storeWindSpeedUnitPreference(nextUnit);
            return nextUnit;
        });
    }, []);
    const commitSettingsDrawerOpen = useCallback(() => {
        setShowSettingsDrawer(true);
    }, []);
    const { openHandlers: settingsDrawerSwipeHandlers, panelHandlers: settingsDrawerPanelHandlers, requestOpen: openSettingsDrawer, requestClose: closeSettingsDrawer, isPresented: settingsDrawerPresented, isInteracting: settingsDrawerIsInteracting, progress: settingsDrawerProgress, offsetPx: settingsDrawerOffsetPx, transitionMs: settingsDrawerTransitionMs, } = useSettingsDrawerSwipe({
        enabled: !showBLEModal,
        isOpen: showSettingsDrawer,
        isUpsideDown,
        onOpen: commitSettingsDrawerOpen,
        onClose: commitSettingsDrawerClose,
    });
    const dashboardContentClassName = [
        'dashboard-content',
        'ion-no-padding',
        `${currentThemeId}-theme`,
        settingsDrawerPresented ? 'settings-drawer-open' : ''
    ].filter(Boolean).join(' ');
    const resizeActiveSlideChart = useCallback((index = activeIndexRef.current) => {
        if (index === GAUGE_SLIDE_INDEX) {
            gaugeChartRef.current?.resize();
            return;
        }
        if (index === CHART_SLIDE_INDEX) {
            lineChartRef.current?.resize();
        }
    }, []);
    const syncCarouselHeight = useCallback((swiper = swiperInstance) => {
        if (!swiper)
            return;
        requestAnimationFrame(() => {
            updateCarouselAutoHeight(swiper);
        });
    }, [swiperInstance]);
    useEffect(() => {
        const resizeTimeout = setTimeout(() => {
            resizeActiveSlideChart();
        }, 500);
        const handleResize = () => {
            resizeActiveSlideChart();
            syncCarouselHeight();
        };
        window.addEventListener('resize', handleResize);
        return () => {
            clearTimeout(resizeTimeout);
            window.removeEventListener('resize', handleResize);
        };
    }, [resizeActiveSlideChart, syncCarouselHeight]);
    return (<IonPage style={{ background: themes[currentTheme].gradient } as React.CSSProperties}>
      {!showBLEModal && !showSettingsDrawer && shouldRenderMemoryMonitor(import.meta.env.DEV, showMemoryMonitor) && (<div className="memory-monitor-wrapper">
          <MemoryMonitor />
        </div>)}
      <IonContent className={dashboardContentClassName} style={{
            '--background': themes[currentTheme].gradient,
            '--dashboard-gradient': themes[currentTheme].gradient,
            '--accent-color': themes[currentTheme].accentColor,
            '--padding-top': '0px',
            '--padding-bottom': '0px',
            '--padding-start': '0px',
            '--padding-end': '0px',
        } as React.CSSProperties}>
        <div className="dashboard-shell" data-testid="dashboard-shell" aria-hidden={showSettingsDrawer ? true : undefined} inert={showSettingsDrawer ? true : undefined} {...settingsDrawerSwipeHandlers}>
          
          <div className="header-logo-container">
            <ControlIconButton className="settings-menu-button" onClick={openSettingsDrawer} title="設定メニューを開く" aria-label="設定メニューを開く" aria-expanded={showSettingsDrawer} aria-controls="ble-settings-drawer-panel" tone="neutral">
              <Menu className="ulsa-icon" size={28} strokeWidth={1.8} aria-hidden="true"/>
            </ControlIconButton>
            <ControlIconButton className={`flip-button ${isUpsideDown ? 'active' : ''}`} onClick={toggleFlip} title={flipButtonLabel} aria-label={flipButtonLabel} selectionState={isUpsideDown ? 'on' : 'off'} tone={isUpsideDown ? 'accent' : 'neutral'}>
              <FlipVertical2 className="ulsa-icon" size={21} strokeWidth={1.8} aria-hidden="true"/>
            </ControlIconButton>
            <div className="header-brand-lockup">
              <a className="header-brand-link" href={DEFAULT_LANDING_PAGE_URL} target="_blank" rel="noreferrer noopener" aria-label="STRVSN ULSA EVO 公開サイトを開く">
                <img src={themes[currentTheme]?.isLight ? '/logo-inverse.png' : '/logo.png'} alt="STRVSN Logo" className="header-logo" width={1000} height={263} decoding="sync"/>
              </a>
            </div>
          </div>

          
          <StatusCard connectionState={ble.connectionState} dataState={ble.dataState} deviceName={ble.connectedDevice?.name || null} signalRssi={ble.connectedDevice?.rssi} signalRssiSupported={ble.platformInfo?.platform === 'ios'} subscribeDisplaySamples={ble.platformInfo?.platform === 'web' ? ble.subscribeDisplaySamples : undefined} sensorStatus={ble.sensorData} onClick={handleStatusCardClick}/>

          <LogRecordingCard active={logRecording.logButtonActive} disabled={logRecording.logButtonDisabled} hasError={logRecording.recordingHasError} modeLabel={logRecording.logRecordingModeLabel} elapsedLabel={logRecording.recordingElapsedLabel} actionTitle={logRecording.logButtonTitle} destinations={logRecording.recordingDestinations} canChangeDestinations={logRecording.canChangeLogRecordingMode} onToggleDestination={logRecording.toggleLogRecordingDestination} onToggle={logRecording.toggleLogRecording}/>

          <SensorDataBoundary dataSource={dataSource} subscribeDisplaySamples={ble.subscribeDisplaySamples ?? NOOP_DISPLAY_SUBSCRIPTION} subscribeTimelineSamples={ble.subscribeTimelineSamples ?? NOOP_TIMELINE_SUBSCRIPTION} lineChartRef={lineChartRef} reactiveValues={activeIndex === WIND_ROSE_SLIDE_INDEX || windPipActivityActive}>
            {({ values: sensorValues, getPresentationValues, subscribePresentationValues, bufferRefs, lastDebugLogTime, displayUpdateRef, }) => {
            const windRoseDataFreshness = resolveWindRoseDataFreshness({
                isConnected: ble.connectionState === 'connected',
                windSpeedReceivedAt: displayUpdateRef.current?.standardFieldReceivedAt.windSpeed,
                windDirectionReceivedAt: displayUpdateRef.current?.standardFieldReceivedAt.windDirection,
            });
            return <>
          
          <div className={`carousel-wrapper${activeIndex === CHART_SLIDE_INDEX ? ' chart-slide-active' : ''}`}>
            {activeIndex > 0 && (<ControlIconButton className="carousel-nav prev" aria-label="前のカルーセルを表示" disabled={!swiperInstance || swiperInstance.destroyed} onClick={() => moveCarousel(-1)}>
                <ChevronLeft className="ulsa-icon" size={22} strokeWidth={1.9} aria-hidden="true"/>
              </ControlIconButton>)}
            <Swiper modules={DASHBOARD_SWIPER_MODULES} spaceBetween={20} slidesPerView={1} autoHeight observer observeParents dir="ltr" touchRatio={swiperTouchRatio} initialSlide={activeIndex} pagination={{ clickable: true, el: '.carousel-pagination' }} keyboard={DASHBOARD_SWIPER_KEYBOARD} a11y={DASHBOARD_SWIPER_A11Y} onSwiper={(swiper) => {
                    setSwiperInstance(swiper);
                    const nextIndex = swiper.activeIndex;
                    setActiveIndex(nextIndex);
                    requestAnimationFrame(() => {
                        resizeActiveSlideChart(nextIndex);
                        updateCarouselAutoHeight(swiper);
                    });
                }} onSlideChange={(swiper) => {
                    const nextIndex = swiper.activeIndex;
                    setActiveIndex(nextIndex);
                    requestAnimationFrame(() => {
                        resizeActiveSlideChart(nextIndex);
                        updateCarouselAutoHeight(swiper);
                    });
                }} className="main-swiper">
              
              <SwiperSlide dir="ltr">
                <WindRoseGaugeSlide isActive={activeIndex === WIND_ROSE_SLIDE_INDEX} isUlsaConnected={ble.connectionState === 'connected'} windSpeed={sensorValues.windSpeed} windSpeedUnit={windSpeedUnit} windDirectionContinuous={sensorValues.windDirectionContinuous} temperature={sensorValues.temperature} soundSpeed={sensorValues.soundSpeed} headingSpeed={sensorValues.headingSpeed} windSpeedAverage10m={sensorValues.windSpeedAverage10m} cardLogState={cardPipLogStatus?.state ?? 'disabled'} cardLogDetail={cardPipLogStatus?.detail} appLogState={appPipLogStatus?.state ?? 'disabled'} appLogDetail={appPipLogStatus?.detail} sampleTimestampMs={windRoseDataFreshness.sampleTimestampMs} themeVariant={resolveWindRoseThemeVariant(currentTheme)} dataState={windRoseDataFreshness.dataState} onUnitCycle={cycleWindSpeedUnit} onRequestActivate={handleWindPipRestore} onPipActivityChange={handleWindPipActivityChange}/>
              </SwiperSlide>

              
              <SwiperSlide dir="ltr">
                <GaugeSlide isActive={activeIndex === GAUGE_SLIDE_INDEX} selectedGauge={selectedGauge} onGaugeChange={setSelectedGauge} windSpeed={sensorValues.windSpeed} windSpeedUnit={windSpeedUnit} temperature={sensorValues.temperature} soundSpeed={sensorValues.soundSpeed} windDirectionContinuous={sensorValues.windDirectionContinuous} onUnitCycle={cycleWindSpeedUnit} gaugeChartRef={gaugeChartRef} themeIndex={currentTheme} windSpeedMax={windSpeedMax} temperatureMax={temperatureMax} soundSpeedMax={soundSpeedMax} onMaxChange={handleMaxChange} subscribeDisplaySamples={ble.subscribeDisplaySamples}/>
              </SwiperSlide>

              
              <SwiperSlide dir="ltr">
                <ChartSlide isActive={activeIndex === CHART_SLIDE_INDEX} selectedChart={selectedChart} onChartChange={setSelectedChart} timeScale={timeScale} onTimeScaleChange={setTimeScale} chartScaleMode={chartScaleMode} onScaleModeCycle={handleChartScaleCycle} bufferRefs={bufferRefs} lastDebugLogTime={lastDebugLogTime} lineChartRef={lineChartRef} themeIndex={currentTheme} onInlineLayoutRestored={syncCarouselHeight}/>
              </SwiperSlide>
            </Swiper>
            {activeIndex < CHART_SLIDE_INDEX && (<ControlIconButton className="carousel-nav next" aria-label="次のカルーセルを表示" disabled={!swiperInstance || swiperInstance.destroyed} onClick={() => moveCarousel(1)}>
                <ChevronRight className="ulsa-icon" size={22} strokeWidth={1.9} aria-hidden="true"/>
              </ControlIconButton>)}
            
            <div className="carousel-pagination"></div>
          </div>

          
          <MetricsGrid windSpeed={sensorValues.windSpeed} windSpeedAverage10m={sensorValues.windSpeedAverage10m} windSpeedUnit={windSpeedUnit} windDirection={sensorValues.windDirection} headingSpeed={sensorValues.headingSpeed} temperature={sensorValues.temperature} soundSpeed={sensorValues.soundSpeed} bufferRefs={bufferRefs} getPresentationValues={getPresentationValues} subscribePresentationValues={subscribePresentationValues}/>
              </>;
        }}
          </SensorDataBoundary>

          {false}

          
          {bleModalPresented && (<Suspense fallback={null}>
              <BLEModal isOpen={showBLEModal} onDismiss={handleBLEModalDismiss} connectionState={ble.connectionState} dataState={ble.dataState} connectedDevice={ble.connectedDevice} availableDevices={ble.availableDevices} identifyingDeviceId={ble.identifyingDeviceId} error={ble.error} isSupported={ble.isSupported} platformInfo={ble.platformInfo} themeGradient={themes[currentTheme].gradient} themeIsLight={Boolean(themes[currentTheme]?.isLight)} isContinuousNativeScanActive={isContinuousNativeScanActive} onScanAndConnect={handleBleScanAndConnect} onConnectToDevice={handleConnectToBleDevice} onIdentifyDevice={ble.identifyDevice} onDisconnect={ble.disconnect} onClearError={ble.clearError}/>
            </Suspense>)}
        </div>
        {settingsDrawerPresented && (<Suspense fallback={null}>
            <BLESettingsDrawerBridge isOpen={settingsDrawerPresented} isModalActive={showSettingsDrawer} entryMode={settingsDrawerIsInteracting ? 'interactive' : 'settled'} interactionProgress={settingsDrawerProgress} interactionOffsetPx={settingsDrawerOffsetPx} interactionTransitionMs={settingsDrawerTransitionMs} panelGestureHandlers={settingsDrawerPanelHandlers} onDismiss={closeSettingsDrawer} isUpsideDown={isUpsideDown} ble={ble} browserLog={logRecording} currentThemeIndex={currentTheme} themeGradient={themes[currentTheme].gradient} themeIsLight={Boolean(themes[currentTheme]?.isLight)} onThemeChange={handleThemeChange}/>
          </Suspense>)}
        <InitialFirmwareSetupEntry ble={ble} onPresent={commitSettingsDrawerClose}/>
      </IonContent>
    </IonPage>);
};
export default Dashboard;
