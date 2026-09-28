import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, } from 'react';
import { createPortal } from 'react-dom';
import { IonCard, IonCardContent, IonSegment, IonLabel, IonToast } from '@ionic/react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { type ChartType, type TimeScale, type LineChartRef, type ChartScaleMode, type TemperatureSeriesVisibility, type WindSpeedSeriesVisibility, } from '../charts';
import type { SensorBufferRefs } from '../../types/sensor';
import { DEFAULT_ULSA_THEME_INDEX, getUlsaThemeIdFromIndex, themes } from '../../constants/themes';
import { enterChartFullscreen, exitChartFullscreen, isNativeChartFullscreenAvailable } from '../../services/chartFullscreen';
import { recordPerfEvent } from '../../utils/renderPerfDiagnostics';
import { useLongPressSlideImageShare } from '../../hooks/useLongPressSlideImageShare';
import { IonicControlSegmentButton, NativeControlButton } from '../controls';
const LineChart = lazy(() => import('../charts/LineChart'));
const DIALOG_FOCUSABLE_SELECTOR = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]'
].join(',');
const getDialogFocusableElements = (dialog: HTMLElement): HTMLElement[] => Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR))
    .filter((element) => (element.tabIndex >= 0
    && !element.matches(':disabled, [aria-disabled="true"]')
    && !element.closest('[aria-hidden="true"], [hidden], [inert]')));
const focusWithoutScrolling = (element: HTMLElement | null) => {
    if (!element)
        return;
    try {
        element.focus({ preventScroll: true });
    }
    catch {
        element.focus();
    }
};
interface ChartSlideProps {
    isActive?: boolean;
    selectedChart: ChartType;
    onChartChange: (chart: ChartType) => void;
    timeScale: TimeScale;
    onTimeScaleChange: (scale: TimeScale) => void;
    chartScaleMode: ChartScaleMode;
    onScaleModeCycle: () => void;
    bufferRefs: SensorBufferRefs;
    lastDebugLogTime: React.MutableRefObject<number>;
    lineChartRef: React.RefObject<LineChartRef | null>;
    themeIndex: number;
    onInlineLayoutRestored: () => void;
}
const ChartSlide: React.FC<ChartSlideProps> = ({ isActive = true, selectedChart, onChartChange, timeScale, onTimeScaleChange, chartScaleMode, onScaleModeCycle, bufferRefs, lastDebugLogTime, lineChartRef, themeIndex, onInlineLayoutRestored, }) => {
    recordPerfEvent('ChartSlide.render');
    const imageShare = useLongPressSlideImageShare(isActive);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [windSpeedSeriesVisibility, ] = useState<WindSpeedSeriesVisibility>(() => ({ windSpeed: true, windSpeedA: false, windSpeedB: false }));
    const [temperatureSeriesVisibility, ] = useState<TemperatureSeriesVisibility>(() => ({ temperature: true }));
    const fullscreenContainerRef = useRef<HTMLDivElement>(null);
    const fullscreenDialogRef = useRef<HTMLElement>(null);
    const fullscreenToggleButtonRef = useRef<HTMLButtonElement>(null);
    const fullscreenWasOpenRef = useRef(false);
    const fullscreenResizeFrameRef = useRef<number | null>(null);
    const chartScaleLabel = chartScaleMode === 'auto'
        ? '縦軸: 自動'
        : chartScaleMode === 'fixed'
            ? '縦軸: 標準'
            : `縦軸上限: ${chartScaleMode}`;
    const currentTheme = themes[themeIndex] || themes[DEFAULT_ULSA_THEME_INDEX];
    const themeClassName = `${getUlsaThemeIdFromIndex(themeIndex) ?? 'light'}-theme`;
    const resizeFullscreenChart = useCallback(() => {
        if (fullscreenResizeFrameRef.current !== null) {
            cancelAnimationFrame(fullscreenResizeFrameRef.current);
        }
        fullscreenResizeFrameRef.current = requestAnimationFrame(() => {
            fullscreenResizeFrameRef.current = null;
            const chartSurface = fullscreenContainerRef.current?.querySelector<HTMLElement>('.line-chart-surface');
            const surfaceRect = chartSurface?.getBoundingClientRect();
            const explicitSize = surfaceRect && surfaceRect.width > 0 && surfaceRect.height > 0
                ? { width: Math.round(surfaceRect.width), height: Math.round(surfaceRect.height) }
                : undefined;
            lineChartRef.current?.resize(explicitSize);
            lineChartRef.current?.updateData();
        });
    }, [lineChartRef]);
    const openFullscreen = useCallback(() => {
        setIsFullscreen(true);
        void enterChartFullscreen().finally(() => {
            window.setTimeout(resizeFullscreenChart, 350);
        });
    }, [resizeFullscreenChart]);
    const closeFullscreen = useCallback(() => {
        setIsFullscreen(false);
        void exitChartFullscreen().finally(resizeFullscreenChart);
    }, [resizeFullscreenChart]);
    useEffect(() => {
        if (isFullscreen) {
            fullscreenWasOpenRef.current = true;
            focusWithoutScrolling(fullscreenToggleButtonRef.current);
            return;
        }
        if (fullscreenWasOpenRef.current) {
            fullscreenWasOpenRef.current = false;
            focusWithoutScrolling(fullscreenToggleButtonRef.current);
            onInlineLayoutRestored();
        }
    }, [isFullscreen, onInlineLayoutRestored]);
    useEffect(() => {
        if (!isFullscreen)
            return;
        const handleDialogKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeFullscreen();
                return;
            }
            if (event.key !== 'Tab')
                return;
            const dialog = fullscreenDialogRef.current;
            if (!dialog)
                return;
            const focusableElements = getDialogFocusableElements(dialog);
            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }
            const firstFocusable = focusableElements[0];
            const lastFocusable = focusableElements[focusableElements.length - 1];
            const activeIndex = document.activeElement instanceof HTMLElement
                ? focusableElements.indexOf(document.activeElement)
                : -1;
            if (event.shiftKey && activeIndex <= 0) {
                event.preventDefault();
                focusWithoutScrolling(lastFocusable);
            }
            else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusableElements.length - 1)) {
                event.preventDefault();
                focusWithoutScrolling(firstFocusable);
            }
        };
        document.addEventListener('keydown', handleDialogKeyDown);
        return () => document.removeEventListener('keydown', handleDialogKeyDown);
    }, [closeFullscreen, isFullscreen]);
    useEffect(() => {
        if (!isFullscreen)
            return;
        const ionApp = document.querySelector('ion-app');
        ionApp?.classList.add('app-chart-fullscreen');
        document.body.classList.add('chart-fullscreen-active');
        window.addEventListener('resize', resizeFullscreenChart);
        window.addEventListener('orientationchange', resizeFullscreenChart);
        window.visualViewport?.addEventListener('resize', resizeFullscreenChart);
        const fullscreenContainer = fullscreenContainerRef.current;
        const resizeObserver = fullscreenContainer && typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(resizeFullscreenChart)
            : null;
        if (fullscreenContainer) {
            resizeObserver?.observe(fullscreenContainer);
        }
        resizeFullscreenChart();
        const settleTimers = [120, 350, 700, 1200].map((delay) => (window.setTimeout(resizeFullscreenChart, delay)));
        return () => {
            settleTimers.forEach((timer) => window.clearTimeout(timer));
            window.removeEventListener('resize', resizeFullscreenChart);
            window.removeEventListener('orientationchange', resizeFullscreenChart);
            window.visualViewport?.removeEventListener('resize', resizeFullscreenChart);
            resizeObserver?.disconnect();
            if (fullscreenResizeFrameRef.current !== null) {
                cancelAnimationFrame(fullscreenResizeFrameRef.current);
                fullscreenResizeFrameRef.current = null;
            }
            ionApp?.classList.remove('app-chart-fullscreen');
            document.body.classList.remove('chart-fullscreen-active');
        };
    }, [isFullscreen, resizeFullscreenChart]);
    useEffect(() => {
        if (isNativeChartFullscreenAvailable())
            return;
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setIsFullscreen(false);
            }
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);
    const card = (<IonCard className={`chart-card-slide${isFullscreen ? ' is-fullscreen' : ''}`} data-slide-image-card>
      <IonCardContent className="chart-content">
        <div className="chart-navigation-row">
          <IonSegment value={selectedChart} onIonChange={e => onChartChange(e.detail.value as ChartType)} className="chart-segment">
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedChart === 'windSpeed' ? 'on' : 'off'} tone="accent" value="windSpeed">
              <IonLabel>風速</IonLabel>
            </IonicControlSegmentButton>
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedChart === 'windDirection' ? 'on' : 'off'} tone="accent" value="windDirection">
              <IonLabel>風向</IonLabel>
            </IonicControlSegmentButton>
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedChart === 'temperature' ? 'on' : 'off'} tone="accent" value="temperature">
              <IonLabel>音仮温度</IonLabel>
            </IonicControlSegmentButton>
            <IonicControlSegmentButton controlSize="M44" selectionState={selectedChart === 'soundSpeed' ? 'on' : 'off'} tone="accent" value="soundSpeed">
              <IonLabel>音速</IonLabel>
            </IonicControlSegmentButton>
          </IonSegment>
          {isFullscreen && (<NativeControlButton ref={fullscreenToggleButtonRef} controlSize="I44" className="chart-fullscreen-button chart-fullscreen-close" onClick={closeFullscreen} title="全画面を閉じる" aria-label="全画面を閉じる">
              <Minimize2 className="ulsa-icon" size={18} strokeWidth={2} aria-hidden="true"/>
            </NativeControlButton>)}
        </div>
        <div ref={fullscreenContainerRef} className="chart-container-slide chart-interaction-surface swiper-no-swiping slide-image-share-target" {...imageShare.handlers}>
          {isActive && (<Suspense fallback={(<div className="chart-loading-state" role="status">
                  グラフを準備中...
                </div>)}>
              <LineChart ref={lineChartRef} isActive={isActive} selectedChart={selectedChart} timeScale={timeScale} chartScaleMode={chartScaleMode} windSpeedSeriesVisibility={windSpeedSeriesVisibility} temperatureSeriesVisibility={temperatureSeriesVisibility} windSpeedBufferRef={bufferRefs.windSpeedBufferRef} windSpeedABufferRef={bufferRefs.windSpeedABufferRef} windSpeedBBufferRef={bufferRefs.windSpeedBBufferRef} windDirectionBufferRef={bufferRefs.windDirectionBufferRef} temperatureBufferRef={bufferRefs.temperatureBufferRef} soundSpeedBufferRef={bufferRefs.soundSpeedBufferRef} timestampBufferRef={bufferRefs.timestampBufferRef} timestampMsBufferRef={bufferRefs.timestampMsBufferRef} lastDebugLogTime={lastDebugLogTime} themeIndex={themeIndex}/>
            </Suspense>)}
          {false}
          <div className="time-scale-buttons">
            {!isFullscreen && (<NativeControlButton ref={fullscreenToggleButtonRef} controlSize="I44" className="chart-fullscreen-button" onClick={openFullscreen} title="グラフを全画面表示" aria-label="グラフを全画面表示">
                <Maximize2 className="ulsa-icon" size={18} strokeWidth={2} aria-hidden="true"/>
              </NativeControlButton>)}
            <NativeControlButton controlSize="C36" selectionState={timeScale === '10s' ? 'on' : 'off'} tone="accent" className={`time-scale-btn ${timeScale === '10s' ? 'active' : ''}`} onClick={() => onTimeScaleChange('10s')}>10s</NativeControlButton>
            <NativeControlButton controlSize="C36" selectionState={timeScale === '1m' ? 'on' : 'off'} tone="accent" className={`time-scale-btn ${timeScale === '1m' ? 'active' : ''}`} onClick={() => onTimeScaleChange('1m')}>1min</NativeControlButton>
            <NativeControlButton controlSize="C36" selectionState={timeScale === '10m' ? 'on' : 'off'} tone="accent" className={`time-scale-btn ${timeScale === '10m' ? 'active' : ''}`} onClick={() => onTimeScaleChange('10m')}>10m</NativeControlButton>
            <NativeControlButton controlSize="C36" className="chart-scale-indicator" onClick={onScaleModeCycle} title={`縦軸の表示範囲を変更（現在: ${chartScaleLabel}）`} aria-label={`縦軸の表示範囲を変更（現在: ${chartScaleLabel}）`}>
              {chartScaleLabel}
            </NativeControlButton>
          </div>
        </div>
      </IonCardContent>
    </IonCard>);
    const imageShareError = (<IonToast isOpen={imageShare.error !== null} message={imageShare.error ?? ''} duration={3000} onDidDismiss={imageShare.clearError}/>);
    if (isFullscreen && typeof document !== 'undefined') {
        return createPortal(<section ref={fullscreenDialogRef} className={`chart-fullscreen-overlay dashboard-content ${themeClassName}`} style={{ '--dashboard-gradient': currentTheme.gradient } as CSSProperties} role="dialog" aria-modal="true" aria-label="グラフ全画面" data-testid="chart-fullscreen-overlay">
        {card}
        {imageShareError}
      </section>, document.body);
    }
    return <div className="slide-content">{card}{imageShareError}</div>;
};
export default memo(ChartSlide);
