import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonAlert } from '@ionic/react';
import { Clock3, CloudUpload, Database, Info as InfoIcon, Palette, RadioTower, SlidersHorizontal, X, type LucideIcon, } from 'lucide-react';
import { ULSA_THEME_INDEX_BY_ID, themes } from '../constants/themes';
import { isStm32UpdaterEnabled } from '../config/stm32UpdaterFeature';
import { formatI2cAddress } from '../services/ble';
import { recordPerfEvent } from '../utils/renderPerfDiagnostics';
import { DevicePanel } from './ble-settings/DevicePanel';
import { normalizeLedBrightness } from '../services/ble/ledBrightness';
import { AppearancePanel } from './ble-settings/AppearancePanel';
import { I2cPanel } from './ble-settings/I2cPanel';
import { InfoPanel } from './ble-settings/InfoPanel';
import { areBLESettingsDrawerPropsEqual } from './ble-settings/memo';
import { OverviewPanel } from './ble-settings/OverviewPanel';
import { OtaPanel } from './ble-settings/OtaPanel';
import { Stm32FirmwareUpdatePanel } from './ble-settings/Stm32FirmwareUpdatePanel';
import { StoragePanel } from './ble-settings/StoragePanel';
import { TimePanel } from './ble-settings/TimePanel';
import type { BLESettingsDrawerProps, SettingsCategory } from './ble-settings/types';
import { useDrawerDialogA11y } from './ble-settings/useDrawerDialogA11y';
import { NativeControlButton } from './controls';
import { ControlIconButton } from './controls';
import { formatCompactNumber, formatRtcOffset, getConnectionStatusText, getDrawerStyle, getI2cResultLabel, } from './ble-settings/formatters';
import './BLESettingsDrawer.css';
const BLESettingsDrawer: React.FC<BLESettingsDrawerProps> = ({ isOpen, entryMode = 'animated', isModalActive, interactionProgress = 1, interactionOffsetPx = 0, interactionTransitionMs = 0, panelGestureHandlers, onDismiss, isUpsideDown = false, connectionState, dataState, connectedDevice, deviceInfo, stm32FirmwareVersion = null, stm32FirmwareVersionLastReadAt = null, deviceHealthStatus = null, deviceHealthLastReadAt = null, capabilitiesStatus = null, capabilitiesLastReadAt = null, ledBrightnessStatus = null, ledBrightnessSupported = null, ledBrightnessBusy = false, ledWindReactiveStatus = null, ledWindReactiveSupported = null, ledWindReactiveBusy = false, deviceResetStatus = null, deviceResetSupported = null, deviceResetBusy = false, otaControlStatus = null, otaControlBusy = false, stm32UpdateControlStatus = null, stm32UpdateControlBusy = false, cardStatus, cardStatusLastReadAt = null, cardLogDetailStatus = null, cardLogDetailLastReadAt = null, cardLogSettingsStatus = null, cardLogSettingsLastReadAt = null, cardLogSettingsBusy = false, browserLogIntervalMs, browserLogStatus, browserLogExportBusy, browserLogExportDisabled, browserLogExportTitle, browserLogPreparedArchive, browserLogNextExportBatch, browserLogExportNotice, browserLogExportError, browserLogMaintenanceOperation, browserLogMaintenanceError, rtcTimeStatus, deviceModeStatus, deviceModeLastReadAt = null, deviceModeNotifyActive = false, deviceModeSupported = null, i2cConfigStatus, i2cConfigBusy, parseErrorStats, error, isSupported, platformInfo, currentThemeIndex, themeGradient, themeIsLight = false, onThemeChange, onSyncTime, onSetRtcTimezone = () => undefined, onRefreshRtcTime, onRefreshStm32FirmwareVersion = () => undefined, onRefreshFirmwareVersions = onRefreshStm32FirmwareVersion, firmwareInfoBusy = false, firmwareInfoError = null, onRefreshDeviceHealthStatus = () => undefined, onRefreshCapabilitiesStatus = () => undefined, onRefreshLedBrightness = () => undefined, onSetLedBrightness = () => undefined, onRefreshLedWindReactive = () => undefined, onSetLedWindReactive = () => undefined, onRefreshDeviceResetStatus = () => undefined, onResetDevice = async () => null, onRefreshOtaControlStatus = async () => undefined, onWriteOtaControl = async () => null, onVerifyInstalledDemo = async () => undefined, onRefreshStm32UpdateControlStatus = async () => undefined, onWriteStm32UpdateControl = async () => null, onRefreshCardStatus, onRefreshCardLogDetailStatus = () => undefined, onWriteCardLogSettings = () => undefined, onBrowserLogIntervalMsChange, onPrepareBrowserLogExport, onDeliverPreparedBrowserLogExport, onPrepareNextBrowserLogExport, onDiscardPreparedBrowserLogExport, onRefreshBrowserLogs, onDeleteBrowserLogSession, onDeleteAllBrowserLogs, onRefreshDeviceModeStatus, onWriteI2cConfig, onClearError, }) => {
    recordPerfEvent('BLESettingsDrawer.render');
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>('overview');
    const [draftNodeId, setDraftNodeId] = useState('');
    const [draftAvgCycle, setDraftAvgCycle] = useState(1);
    const [draftWindMode, setDraftWindMode] = useState(0);
    const [draftI2cAddress, setDraftI2cAddress] = useState('');
    const [cardLogInputMode, setCardLogInputMode] = useState<'hz' | 'seconds'>('hz');
    const [draftCardLogInterval, setDraftCardLogInterval] = useState('');
    const [draftLedBrightness, setDraftLedBrightness] = useState(0);
    const [showRestoreDefaultsAlert, setShowRestoreDefaultsAlert] = useState(false);
    const panelRef = useRef<HTMLElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const detailRef = useRef<HTMLElement>(null);
    const modalActive = isModalActive ?? isOpen;
    const stm32UpdaterEnabled = isStm32UpdaterEnabled();
    const handleI2cSetAndSave = useCallback(async (request: Parameters<typeof onWriteI2cConfig>[0]) => {
        const setSucceeded = await onWriteI2cConfig(request);
        if (setSucceeded === false)
            return;
        await onWriteI2cConfig({ op: 'save' });
    }, [onWriteI2cConfig]);
    useDrawerDialogA11y({
        active: modalActive,
        panelRef,
        initialFocusRef: closeButtonRef,
        onDismiss,
    });
    const isScanning = connectionState === 'scanning';
    const isConnecting = connectionState === 'connecting';
    const isConnected = connectionState === 'connected';
    const isBusy = isScanning || isConnecting;
    const isI2cConfigWritable = Boolean(i2cConfigStatus?.configWriteSupported);
    useEffect(() => {
        if (!i2cConfigStatus)
            return;
        setDraftNodeId(String(i2cConfigStatus.nodeId));
        setDraftAvgCycle(i2cConfigStatus.avgCycle);
        setDraftWindMode(i2cConfigStatus.windDirInstallMode);
        setDraftI2cAddress(formatI2cAddress(i2cConfigStatus.i2cAddress));
    }, [i2cConfigStatus]);
    useEffect(() => {
        if (!cardLogSettingsStatus)
            return;
        const intervalMs = cardLogSettingsStatus.currentIntervalMs;
        if (intervalMs > 0 && intervalMs < 1000) {
            setCardLogInputMode('hz');
            setDraftCardLogInterval(formatCompactNumber(1000 / intervalMs));
        }
        else if (intervalMs >= 1000) {
            setCardLogInputMode('seconds');
            setDraftCardLogInterval(formatCompactNumber(intervalMs / 1000));
        }
    }, [cardLogSettingsStatus]);
    useEffect(() => {
        if (!ledBrightnessStatus || ledBrightnessBusy)
            return;
        setDraftLedBrightness(normalizeLedBrightness(ledBrightnessStatus.brightness));
    }, [ledBrightnessBusy, ledBrightnessStatus]);
    if (!isOpen)
        return null;
    const categories: Array<{
        id: SettingsCategory;
        label: string;
        icon: LucideIcon;
        summary: string;
    }> = [
        { id: 'overview', label: '概要', icon: RadioTower, summary: getConnectionStatusText(connectionState, dataState) },
        { id: 'firmware', label: 'FW更新', icon: CloudUpload, summary: '本体の更新' },
        { id: 'storage', label: 'カード/ログ', icon: Database, summary: cardLogDetailStatus?.loggingEnabled ? '記録中' : '保存・書き出し' },
        { id: 'time', label: '時刻', icon: Clock3, summary: rtcTimeStatus.supported === false ? '未取得' : formatRtcOffset(rtcTimeStatus.offsetMs, rtcTimeStatus.offsetAssessment) },
        { id: 'i2c', label: '計測設定', icon: SlidersHorizontal, summary: i2cConfigStatus ? getI2cResultLabel(i2cConfigStatus) : '計測・接続' },
        { id: 'appearance', label: '表示', icon: Palette, summary: themes[currentThemeIndex]?.name ?? '画面テーマ' },
        { id: 'info', label: '情報', icon: InfoIcon, summary: 'サポート' },
        ...([])
    ];
    const renderDeviceSection = (section: 'firmware' | 'measurement') => (<DevicePanel section={section} isUpsideDown={isUpsideDown} isConnected={isConnected} deviceInfo={deviceInfo} stm32FirmwareVersion={stm32FirmwareVersion} stm32FirmwareVersionLastReadAt={stm32FirmwareVersionLastReadAt} deviceModeStatus={deviceModeStatus} deviceModeLastReadAt={deviceModeLastReadAt} deviceModeNotifyActive={deviceModeNotifyActive} deviceModeSupported={deviceModeSupported} deviceHealthStatus={deviceHealthStatus} deviceHealthLastReadAt={deviceHealthLastReadAt} capabilitiesStatus={capabilitiesStatus} capabilitiesLastReadAt={capabilitiesLastReadAt} ledBrightnessStatus={ledBrightnessStatus} ledBrightnessSupported={ledBrightnessSupported} ledBrightnessBusy={ledBrightnessBusy} ledWindReactiveStatus={ledWindReactiveStatus} ledWindReactiveSupported={ledWindReactiveSupported} ledWindReactiveBusy={ledWindReactiveBusy} deviceResetStatus={deviceResetStatus} deviceResetSupported={deviceResetSupported} deviceResetBusy={deviceResetBusy} draftLedBrightness={draftLedBrightness} onDraftLedBrightnessChange={setDraftLedBrightness} onRefreshStm32FirmwareVersion={onRefreshStm32FirmwareVersion} onRefreshFirmwareVersions={onRefreshFirmwareVersions} firmwareInfoBusy={firmwareInfoBusy} firmwareInfoError={firmwareInfoError} onRefreshDeviceModeStatus={onRefreshDeviceModeStatus} onRefreshDeviceHealthStatus={onRefreshDeviceHealthStatus} onRefreshCapabilitiesStatus={onRefreshCapabilitiesStatus} onRefreshLedBrightness={onRefreshLedBrightness} onSetLedBrightness={onSetLedBrightness} onRefreshLedWindReactive={onRefreshLedWindReactive} onSetLedWindReactive={onSetLedWindReactive} onRefreshDeviceResetStatus={onRefreshDeviceResetStatus} onResetDevice={onResetDevice}/>);
    const renderActiveCategory = () => {
        switch (activeCategory) {
            case 'appearance':
                return (<AppearancePanel currentThemeIndex={currentThemeIndex} onThemeChange={onThemeChange}/>);
            case 'firmware':
                return (<>
            {renderDeviceSection('firmware')}
            <OtaPanel isConnected={isConnected} capabilitiesStatus={capabilitiesStatus} otaControlStatus={otaControlStatus} otaControlBusy={otaControlBusy} platformInfo={platformInfo} onRefreshOtaControlStatus={onRefreshOtaControlStatus} onWriteOtaControl={onWriteOtaControl} onVerifyInstalledDemo={onVerifyInstalledDemo}/>
            {stm32UpdaterEnabled && (<Stm32FirmwareUpdatePanel isConnected={isConnected} capabilitiesStatus={capabilitiesStatus} stm32FirmwareVersion={stm32FirmwareVersion} stm32UpdateControlStatus={stm32UpdateControlStatus} stm32UpdateControlBusy={stm32UpdateControlBusy} observedBleNodeId={connectedDevice?.nodeId} platformInfo={platformInfo} onRefreshStm32FirmwareVersion={onRefreshStm32FirmwareVersion} onRefreshStm32UpdateControlStatus={onRefreshStm32UpdateControlStatus} onWriteStm32UpdateControl={onWriteStm32UpdateControl}/>)}
          </>);
            case 'time':
                return (<TimePanel rtcTimeStatus={rtcTimeStatus} deviceHealthStatus={deviceHealthStatus} timezoneCapability={capabilitiesStatus
                        ? capabilitiesStatus.timezoneConfig && capabilitiesStatus.interfaceRevision >= 0x0e
                        : null} deviceKey={connectedDevice?.deviceId ?? null} onRefreshRtcTime={onRefreshRtcTime} onSyncTime={onSyncTime} onSetRtcTimezone={onSetRtcTimezone}/>);
            case 'storage':
                return (<StoragePanel isConnected={isConnected} isUpsideDown={isUpsideDown} cardStatus={cardStatus} cardStatusLastReadAt={cardStatusLastReadAt} cardLogDetailStatus={cardLogDetailStatus} cardLogDetailLastReadAt={cardLogDetailLastReadAt} cardLogSettingsStatus={cardLogSettingsStatus} cardLogSettingsLastReadAt={cardLogSettingsLastReadAt} cardLogSettingsBusy={cardLogSettingsBusy} browserLogIntervalMs={browserLogIntervalMs} browserLogStatus={browserLogStatus} browserLogExportBusy={browserLogExportBusy} browserLogExportDisabled={browserLogExportDisabled} browserLogExportTitle={browserLogExportTitle} browserLogPreparedArchive={browserLogPreparedArchive} browserLogNextExportBatch={browserLogNextExportBatch} browserLogExportNotice={browserLogExportNotice} browserLogExportError={browserLogExportError} browserLogMaintenanceOperation={browserLogMaintenanceOperation} browserLogMaintenanceError={browserLogMaintenanceError} cardLogInputMode={cardLogInputMode} draftCardLogInterval={draftCardLogInterval} onCardLogInputModeChange={setCardLogInputMode} onDraftCardLogIntervalChange={setDraftCardLogInterval} onRefreshCardStatus={onRefreshCardStatus} onRefreshCardLogDetailStatus={onRefreshCardLogDetailStatus} onWriteCardLogSettings={onWriteCardLogSettings} onBrowserLogIntervalMsChange={onBrowserLogIntervalMsChange} onPrepareBrowserLogExport={onPrepareBrowserLogExport} onDeliverPreparedBrowserLogExport={onDeliverPreparedBrowserLogExport} onPrepareNextBrowserLogExport={onPrepareNextBrowserLogExport} onDiscardPreparedBrowserLogExport={onDiscardPreparedBrowserLogExport} onRefreshBrowserLogs={onRefreshBrowserLogs} onDeleteBrowserLogSession={onDeleteBrowserLogSession} onDeleteAllBrowserLogs={onDeleteAllBrowserLogs}/>);
            case 'i2c':
                return (<>
            <I2cPanel status={i2cConfigStatus} busy={i2cConfigBusy} writable={isI2cConfigWritable} draftNodeId={draftNodeId} draftAvgCycle={draftAvgCycle} draftWindMode={draftWindMode} draftI2cAddress={draftI2cAddress} onDraftNodeIdChange={setDraftNodeId} onDraftAvgCycleChange={setDraftAvgCycle} onDraftWindModeChange={setDraftWindMode} onDraftI2cAddressChange={setDraftI2cAddress} onSetAndSave={handleI2cSetAndSave} onWrite={onWriteI2cConfig} onRestoreDefaultsClick={() => setShowRestoreDefaultsAlert(true)}/>
            {renderDeviceSection('measurement')}
          </>);
            case 'sample':
                return null;
            case 'info':
                return <InfoPanel />;
            default:
                return (<OverviewPanel connectionState={connectionState} dataState={dataState} connectedDevice={connectedDevice} parseErrorStats={parseErrorStats} error={error} isBusy={isBusy} isSupported={isSupported} platformInfo={platformInfo} onClearError={onClearError}/>);
        }
    };
    const activeLabel = categories.find((category) => category.id === activeCategory)?.label ?? '概要';
    const drawerStyle = {
        ...getDrawerStyle(themeGradient),
        ...(entryMode !== 'animated'
            ? {
                '--ble-settings-backdrop-animation': 'none',
                '--ble-settings-panel-animation': 'none',
            }
            : {}),
        ...(entryMode === 'interactive'
            ? {
                '--ble-settings-interaction-progress': String(interactionProgress),
                '--ble-settings-interaction-offset': `${interactionOffsetPx}px`,
                '--ble-settings-interaction-duration': `${interactionTransitionMs}ms`,
            }
            : {}),
    } as React.CSSProperties;
    return (<div className={`ble-settings-drawer ${entryMode === 'interactive' ? 'ble-settings-drawer-interactive' : ''} ${themeIsLight ? 'ble-settings-drawer-light' : ''} ${currentThemeIndex === ULSA_THEME_INDEX_BY_ID.slate ? 'ble-settings-drawer-slate' : ''}`} style={drawerStyle} data-testid="ble-settings-drawer" data-interaction-progress={entryMode === 'interactive' ? interactionProgress.toFixed(3) : undefined} aria-hidden={modalActive ? undefined : true} inert={modalActive ? undefined : true}>
      <button type="button" className="ble-settings-drawer-backdrop" aria-label="設定メニューを閉じる" tabIndex={-1} onClick={onDismiss}/>
      <aside ref={panelRef} id="ble-settings-drawer-panel" className="ble-settings-drawer-panel" role="dialog" aria-modal={modalActive ? true : undefined} aria-labelledby="ble-settings-drawer-title" {...panelGestureHandlers}>
        <header className="ble-settings-header">
          <div>
            <p>SETTINGS</p>
            <h2 id="ble-settings-drawer-title">設定メニュー</h2>
          </div>
          <ControlIconButton ref={closeButtonRef} className="ble-settings-close" onClick={onDismiss} aria-label="設定メニューを閉じる">
            <X className="ulsa-icon" size={20} strokeWidth={1.9} aria-hidden="true"/>
          </ControlIconButton>
        </header>

        <div className="ble-settings-layout">
          <nav className="ble-settings-nav" aria-label="設定カテゴリ">
            {categories.map((category) => {
            const CategoryIcon = category.icon;
            return (<NativeControlButton key={category.id} controlSize="R56" selectionState={activeCategory === category.id ? 'on' : 'off'} tone="accent" className={`ble-settings-nav-item ${activeCategory === category.id ? 'active' : ''}`} onClick={(event) => {
                    setActiveCategory(category.id);
                    if (detailRef.current)
                        detailRef.current.scrollTop = 0;
                    const reduceMotion = typeof window !== 'undefined'
                        && typeof window.matchMedia === 'function'
                        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    event.currentTarget.scrollIntoView?.({
                        behavior: reduceMotion ? 'auto' : 'smooth',
                        block: 'nearest',
                        inline: 'nearest',
                    });
                }} aria-current={activeCategory === category.id ? 'page' : undefined}>
                  <CategoryIcon className="ulsa-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>
                  <span>{category.label}</span>
                  <small>{category.summary}</small>
                </NativeControlButton>);
        })}
          </nav>

          <main ref={detailRef} className="ble-settings-detail" aria-labelledby="ble-settings-detail-title" data-testid="ble-settings-detail">
            <div className="ble-settings-detail-title">
              <p>カテゴリ</p>
              <h2 id="ble-settings-detail-title">{activeLabel}</h2>
            </div>
            {renderActiveCategory()}
          </main>
        </div>
      </aside>

      <IonAlert isOpen={showRestoreDefaultsAlert} cssClass={`ble-restore-alert ${themeIsLight ? 'ble-restore-alert-light' : ''}`} header="I2C設定を既定値へ戻しますか？" message="対象はBLE/I2Cから変更できる設定のみです。較正値、製品情報、シリアル、UART設定は変更しません。保存するまで永続化されません。" buttons={[
            { text: 'キャンセル', role: 'cancel' },
            {
                text: '既定値へ戻す',
                role: 'destructive',
                handler: () => onWriteI2cConfig({ op: 'restoreDefaults' }),
            }
        ]} onDidDismiss={() => setShowRestoreDefaultsAlert(false)}/>
    </div>);
};
export default React.memo(BLESettingsDrawer, areBLESettingsDrawerPropsEqual);
