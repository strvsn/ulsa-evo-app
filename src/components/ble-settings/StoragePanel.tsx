import { IonIcon, IonInput, IonLabel, IonSegment, IonSelect, IonSelectOption, IonToggle, } from '@ionic/react';
import { card, save, settings, sync } from 'ionicons/icons';
import type { CardLogDetailStatus, CardLogSettingsStatus, CardLogSettingsWriteRequest, CardStatus } from '../../types/ble';
import type { BrowserLogPreparedArchive, BrowserLogStatus } from '../../services/browserLog';
import { formatCompactNumber, formatLastLogAge, formatLogInterval, formatReadTime, formatCardType, formatStorageMB, getExactCardLogRateOptions, getDraftCardLogIntervalMs, getCardLogSettingsValidationMessage, } from './formatters';
import { InfoGrid, SectionCard, StatusItem, StatusSummary } from './primitives';
import { getControlOperationalState, IonicControlButton, IonicControlSegmentButton, NativeControlButton, } from '../controls';
import { useEffect, useState, type CSSProperties } from 'react';
import { BrowserLogStoragePanel } from './BrowserLogStoragePanel';
import { isValidBrowserLogIntervalMs, MAX_BROWSER_LOG_INTERVAL_MS, MIN_BROWSER_LOG_INTERVAL_MS, } from '../../hooks/logging/logRecordingPreferences';
type CardLogInputMode = 'hz' | 'seconds';
type LogIntervalTarget = 'card' | 'browser';
const BROWSER_LOG_RATE_OPTIONS = [100, 200, 500, 1000] as const;
type StoragePanelProps = {
    isConnected: boolean;
    isUpsideDown: boolean;
    cardStatus: CardStatus | null;
    cardStatusLastReadAt: number | null;
    cardLogDetailStatus: CardLogDetailStatus | null;
    cardLogDetailLastReadAt: number | null;
    cardLogSettingsStatus: CardLogSettingsStatus | null;
    cardLogSettingsLastReadAt: number | null;
    cardLogSettingsBusy: boolean;
    browserLogIntervalMs: number;
    browserLogStatus: BrowserLogStatus;
    browserLogExportBusy: boolean;
    browserLogExportDisabled: boolean;
    browserLogExportTitle: string;
    browserLogPreparedArchive: BrowserLogPreparedArchive | null;
    browserLogNextExportBatch: {
        sessionId: string | null;
        batchIndex: number;
        batchCount: number;
    } | null;
    browserLogExportNotice: string | null;
    browserLogExportError: string | null;
    browserLogMaintenanceOperation: 'refresh' | 'delete-all' | string | null;
    browserLogMaintenanceError: string | null;
    cardLogInputMode: CardLogInputMode;
    draftCardLogInterval: string;
    onCardLogInputModeChange: (value: CardLogInputMode) => void;
    onDraftCardLogIntervalChange: (value: string) => void;
    onRefreshCardStatus: () => void;
    onRefreshCardLogDetailStatus: () => void;
    onWriteCardLogSettings: (request: CardLogSettingsWriteRequest) => void;
    onBrowserLogIntervalMsChange: (intervalMs: number) => boolean;
    onPrepareBrowserLogExport: (scope?: string | string[]) => void;
    onDeliverPreparedBrowserLogExport: () => void;
    onPrepareNextBrowserLogExport: () => void;
    onDiscardPreparedBrowserLogExport: () => void;
    onRefreshBrowserLogs: () => void;
    onDeleteBrowserLogSession: (sessionId: string) => void;
    onDeleteAllBrowserLogs: () => void;
};
export const StoragePanel = ({ isConnected, isUpsideDown, cardStatus, cardStatusLastReadAt, cardLogDetailStatus, cardLogDetailLastReadAt, cardLogSettingsStatus, cardLogSettingsLastReadAt, cardLogSettingsBusy, browserLogIntervalMs, browserLogStatus, browserLogExportBusy, browserLogExportDisabled, browserLogExportTitle, browserLogPreparedArchive, browserLogNextExportBatch, browserLogExportNotice, browserLogExportError, browserLogMaintenanceOperation, browserLogMaintenanceError, cardLogInputMode, draftCardLogInterval, onCardLogInputModeChange, onDraftCardLogIntervalChange, onRefreshCardStatus, onRefreshCardLogDetailStatus, onWriteCardLogSettings, onBrowserLogIntervalMsChange, onPrepareBrowserLogExport, onDeliverPreparedBrowserLogExport, onPrepareNextBrowserLogExport, onDiscardPreparedBrowserLogExport, onRefreshBrowserLogs, onDeleteBrowserLogSession, onDeleteAllBrowserLogs, }: StoragePanelProps) => {
    const [logIntervalTarget, setLogIntervalTarget] = useState<LogIntervalTarget>('card');
    const [browserLogInputMode, setBrowserLogInputMode] = useState<CardLogInputMode>(browserLogIntervalMs < 1000 ? 'hz' : 'seconds');
    const [draftBrowserLogInterval, setDraftBrowserLogInterval] = useState(() => (formatCompactNumber(browserLogIntervalMs < 1000 ? 1000 / browserLogIntervalMs : browserLogIntervalMs / 1000)));
    useEffect(() => {
        setBrowserLogInputMode(browserLogIntervalMs < 1000 ? 'hz' : 'seconds');
        setDraftBrowserLogInterval(formatCompactNumber(browserLogIntervalMs < 1000 ? 1000 / browserLogIntervalMs : browserLogIntervalMs / 1000));
    }, [browserLogIntervalMs]);
    const cardLogDraftIntervalMs = getDraftCardLogIntervalMs(cardLogInputMode, draftCardLogInterval);
    const browserLogDraftIntervalMs = getDraftCardLogIntervalMs(browserLogInputMode, draftBrowserLogInterval);
    const browserLogSettingsValidationMessage = browserLogDraftIntervalMs === null
        ? '保存するログ周期を入力してください'
        : !isValidBrowserLogIntervalMs(browserLogDraftIntervalMs)
            ? `${formatLogInterval(MIN_BROWSER_LOG_INTERVAL_MS)} - ${formatLogInterval(MAX_BROWSER_LOG_INTERVAL_MS)} の範囲で設定してください`
            : null;
    const cardCapacityAvailable = cardStatus !== null
        && cardStatus.cardState >= 3
        && cardStatus.totalSpaceMB > 0;
    const cardUsagePercent = cardCapacityAvailable
        ? Math.min(100, Math.max(0, cardStatus.usagePercent))
        : 0;
    const cardLogSettingsValidationMessage = getCardLogSettingsValidationMessage(cardLogSettingsStatus, cardLogInputMode, draftCardLogInterval);
    const exactCardLogRateOptions = getExactCardLogRateOptions(cardLogSettingsStatus);
    const cardLogCanUseHzInput = exactCardLogRateOptions.length > 0;
    const canWriteCardLogSettings = Boolean(isConnected &&
        cardLogSettingsStatus &&
        !cardLogSettingsBusy &&
        cardLogDraftIntervalMs !== null &&
        cardLogSettingsValidationMessage === null);
    return (<>
      <SectionCard title="カード" icon={card} actions={(<IonicControlButton fill="outline" controlSize="C36" onClick={onRefreshCardStatus}>
            <IonIcon icon={sync} slot="start"/>
            更新
          </IonicControlButton>)}>
        {cardStatus ? (<>
            {cardCapacityAvailable && (<div className="browser-log-capacity card-storage-capacity" aria-label="カード保存容量">
                <div className="browser-log-capacity-heading">
                  <strong>カード容量</strong>
                  <span>{cardUsagePercent.toFixed(1)}% 使用</span>
                </div>
                <div className="browser-log-capacity-track" role="progressbar" aria-label="カード容量使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(cardUsagePercent.toFixed(1))}>
                  <span className="browser-log-capacity-used" style={{ '--browser-log-capacity-percent': `${cardUsagePercent}%` } as CSSProperties}/>
                </div>
                <div className="browser-log-capacity-values">
                  <span>使用済み <strong>{formatStorageMB(cardStatus.usedSpaceMB)}</strong></span>
                  <span>空き <strong>{formatStorageMB(cardStatus.freeSpaceMB)}</strong></span>
                </div>
              </div>)}
            <InfoGrid rows={[
                {
                    label: '状態',
                    value: (<StatusItem tone={cardStatus.cardState >= 3 ? 'neutral' : cardStatus.cardState === 2 ? 'attention' : 'critical'}>
                    {cardStatus.cardState === 0 && '未初期化'}
                    {cardStatus.cardState === 1 && 'カードなし'}
                    {cardStatus.cardState === 2 && 'エラー'}
                    {cardStatus.cardState === 3 && '準備完了'}
                    {cardStatus.cardState === 4 && '記録中'}
                  </StatusItem>),
                },
                { label: 'カード形式', value: cardStatus.cardState >= 3 ? formatCardType(cardStatus) : '-' },
                { label: '最終取得', value: formatReadTime(cardStatusLastReadAt) }
            ]}/>
          </>) : (<p>カード情報は未取得です。非対応または未応答の場合も接続は維持します。</p>)}
      </SectionCard>

      <SectionCard title="カードログ詳細" icon={card} actions={(<IonicControlButton fill="outline" controlSize="C36" onClick={onRefreshCardLogDetailStatus} operationalState={getControlOperationalState({
                disabled: !isConnected,
                disabledReason: 'BLE未接続です',
            })}>
            <IonIcon icon={sync} slot="start"/>
            更新
          </IonicControlButton>)}>
        {cardLogDetailStatus ? (<>
            <StatusSummary>
              <StatusItem tone={cardLogDetailStatus.cardAvailable ? 'neutral' : 'attention'}>
                {cardLogDetailStatus.cardAvailable ? 'カード利用可' : 'カード未検出'}
              </StatusItem>
              <StatusItem tone={cardLogDetailStatus.loggingEnabled ? 'attention' : 'neutral'}>
                {cardLogDetailStatus.loggingEnabled ? '記録中'
                : cardLogDetailStatus.recordingRequested === false && cardLogDetailStatus.quiescent === false
                    ? '停止処理中' : '停止中'}
              </StatusItem>
              {false}
              {cardLogDetailStatus.slowWrite && <StatusItem tone="attention">書込みに時間がかかっています</StatusItem>}
              {cardLogDetailStatus.errorStop && !cardLogDetailStatus.recovering && <StatusItem tone="critical">エラーで停止</StatusItem>}
              {cardLogDetailStatus.inputPaused && <StatusItem tone="attention">計測モードへの復帰待ち</StatusItem>}
              {cardLogDetailStatus.recovering && <StatusItem tone="attention">カード復旧中</StatusItem>}
            </StatusSummary>
            <InfoGrid rows={[
                { label: 'ログ行数', value: cardLogDetailStatus.logCount },
                { label: '同期確認済み', value: cardLogDetailStatus.syncedLogCount ?? '未対応・未取得' },
                { label: '欠測', value: cardLogDetailStatus.droppedLogCount ?? '未対応・未取得' },
                { label: '保存未確認', value: cardLogDetailStatus.uncertainLogCount ?? '未対応・未取得' },
                { label: '保存待ち', value: cardLogDetailStatus.queueDepth ?? '未対応・未取得' },
                {
                    label: 'ログ周期',
                    value: cardLogSettingsStatus ? formatLogInterval(cardLogSettingsStatus.currentIntervalMs) : `${cardLogDetailStatus.logRateHz} Hz`,
                },
                { label: '最終ログ', value: formatLastLogAge(cardLogDetailStatus.lastLogAgeSeconds) },
                { label: '最終取得', value: formatReadTime(cardLogDetailLastReadAt) }
            ]}/>
            {false}
          </>) : (<p>カードログ詳細は未取得です。未対応firmwareでは表示されません。</p>)}
      </SectionCard>

      <SectionCard title="ログ周期設定" icon={settings}>
        <IonSegment className="log-interval-target-segment" value={logIntervalTarget} aria-label="ログ周期の保存先" onIonChange={(event) => {
            const value = event.detail.value;
            if (value === 'card' || value === 'browser')
                setLogIntervalTarget(value);
        }}>
          <IonicControlSegmentButton controlSize="M44" selectionState={logIntervalTarget === 'card' ? 'on' : 'off'} tone="accent" value="card">
            <IonLabel>カード</IonLabel>
          </IonicControlSegmentButton>
          <IonicControlSegmentButton controlSize="M44" selectionState={logIntervalTarget === 'browser' ? 'on' : 'off'} tone="accent" value="browser">
            <IonLabel>アプリ</IonLabel>
          </IonicControlSegmentButton>
        </IonSegment>

        {logIntervalTarget === 'card' ? cardLogSettingsStatus ? (<>
            <div className="card-log-settings-header">
              <IonLabel>
                <p>カード内ログの現在値</p>
                <h3>{formatLogInterval(cardLogSettingsStatus.currentIntervalMs)}</h3>
              </IonLabel>
              <StatusItem tone={cardLogSettingsStatus.persisted ? 'neutral' : 'attention'}>
                {cardLogSettingsStatus.persisted ? '本体に保存済み' : '未保存'}
              </StatusItem>
            </div>
            <div className="card-log-auto-start-control">
              <div className="card-log-auto-start-heading">
                <h3>電源オンでログ自動開始</h3>
                <IonToggle data-testid="card-log-auto-start-toggle" aria-label="電源オンでログ自動開始" dir={isUpsideDown ? 'rtl' : 'ltr'} checked={cardLogSettingsStatus.autoStartEnabled} disabled={!isConnected || cardLogSettingsBusy} onIonChange={(event) => onWriteCardLogSettings({
                op: 'setAutoStart',
                autoStartEnabled: event.detail.checked,
            })}/>
              </div>
              <p>次回の電源投入時にカードが検出された場合だけ開始します。現在の記録状態は変更しません。</p>
            </div>
            <InfoGrid rows={[
                { label: '設定可能範囲', value: `${formatLogInterval(cardLogSettingsStatus.minIntervalMs)} - ${formatLogInterval(cardLogSettingsStatus.maxIntervalMs)}` },
                { label: 'I2C出力周期', value: cardLogSettingsStatus.stm32IntervalMs ? formatLogInterval(cardLogSettingsStatus.stm32IntervalMs) : '未取得' },
                { label: '設定最終取得', value: formatReadTime(cardLogSettingsLastReadAt) }
            ]}/>
            <div className="card-log-settings-controls">
              <IonSegment value={cardLogInputMode} onIonChange={(event) => {
                const value = event.detail.value;
                if (value === 'hz' || value === 'seconds') {
                    onCardLogInputModeChange(value);
                    if (value === 'hz') {
                        const matchingOption = exactCardLogRateOptions.find((option) => option.intervalMs === cardLogSettingsStatus.currentIntervalMs);
                        const selectedOption = matchingOption ?? exactCardLogRateOptions.at(-1);
                        if (selectedOption) {
                            onDraftCardLogIntervalChange(formatCompactNumber(selectedOption.rateHz));
                        }
                    }
                    else if (value === 'seconds') {
                        onDraftCardLogIntervalChange(formatCompactNumber(Math.max(1, cardLogSettingsStatus.currentIntervalMs / 1000)));
                    }
                }
            }}>
                <IonicControlSegmentButton controlSize="M44" selectionState={cardLogInputMode === 'hz' ? 'on' : 'off'} tone="accent" value="hz" disabled={!cardLogCanUseHzInput}>
                  <IonLabel>Hz</IonLabel>
                </IonicControlSegmentButton>
                <IonicControlSegmentButton controlSize="M44" selectionState={cardLogInputMode === 'seconds' ? 'on' : 'off'} tone="accent" value="seconds">
                  <IonLabel>秒</IonLabel>
                </IonicControlSegmentButton>
              </IonSegment>
              {cardLogInputMode === 'hz' ? (<label className="card-log-settings-field i2c-config-control">
                  <span>ログレート</span>
                  <IonSelect aria-label="ログレート" data-testid="card-log-settings-rate-select" value={cardLogDraftIntervalMs ?? undefined} interface="popover" placeholder="選択" onIonChange={(event) => {
                    const intervalMs = Number(event.detail.value);
                    if (Number.isFinite(intervalMs) && intervalMs > 0) {
                        onDraftCardLogIntervalChange(formatCompactNumber(1000 / intervalMs));
                    }
                }} disabled={cardLogSettingsBusy || !cardLogCanUseHzInput}>
                    {exactCardLogRateOptions.map((option) => (<IonSelectOption key={option.intervalMs} value={option.intervalMs}>
                        {formatLogInterval(option.intervalMs)}
                      </IonSelectOption>))}
                  </IonSelect>
                </label>) : (<label className="card-log-settings-field i2c-config-control">
                  <span>ログ周期</span>
                  <IonInput aria-label="ログ周期" data-testid="card-log-settings-input" type="number" inputmode="decimal" value={draftCardLogInterval} min={1} max={600} step="1" placeholder="1-600" onIonInput={(event) => onDraftCardLogIntervalChange(String(event.detail.value ?? ''))} disabled={cardLogSettingsBusy}/>
                </label>)}
              <div className="card-log-settings-preview">
                {cardLogDraftIntervalMs ? formatLogInterval(cardLogDraftIntervalMs) : '-'}
              </div>
              {cardLogSettingsValidationMessage && (<p className="card-log-settings-message">{cardLogSettingsValidationMessage}</p>)}
              <div className="ble-settings-inline-actions">
                <NativeControlButton data-testid="card-log-settings-save" className="ble-settings-action-button device-setting-save" controlSize="M44" controlVariant="primary" onClick={() => {
                if (cardLogDraftIntervalMs !== null) {
                    onWriteCardLogSettings({ op: 'setIntervalMs', intervalMs: cardLogDraftIntervalMs });
                }
            }} operationalState={getControlOperationalState({
                busy: cardLogSettingsBusy,
                disabled: !canWriteCardLogSettings,
                disabledReason: cardLogSettingsValidationMessage ?? 'BLE未接続または保存できるログ周期を選択してください',
            })}>
                  <IonIcon icon={save}/>
                  保存
                </NativeControlButton>
                <NativeControlButton data-testid="card-log-settings-restore-default" className="ble-settings-action-button outline" controlSize="M44" controlVariant="destructive" tone="danger" onClick={() => onWriteCardLogSettings({ op: 'restoreDefault' })} operationalState={getControlOperationalState({
                busy: cardLogSettingsBusy,
                disabled: !isConnected,
                disabledReason: 'BLE未接続です',
            })}>
                  既定値
                </NativeControlButton>
              </div>
            </div>
          </>) : (<p>カードログ周期設定は未取得です。未対応firmwareでは表示されません。</p>) : (<>
            <div className="card-log-settings-header">
              <IonLabel>
                <p>アプリ内ログの現在値</p>
                <h3>{formatLogInterval(browserLogIntervalMs)}</h3>
              </IonLabel>
              <StatusItem tone="neutral">端末に保存済み</StatusItem>
            </div>
            <p className="card-log-settings-message">
              BLE受信・ゲージ・チャートの更新周期は変更せず、設定周期ごとに最後に受信した1サンプルをCSVへ保存します。平均化しません。
            </p>
            <div className="card-log-settings-controls">
              <IonSegment value={browserLogInputMode} onIonChange={(event) => {
                const value = event.detail.value;
                if (value === 'hz' || value === 'seconds') {
                    setBrowserLogInputMode(value);
                    setDraftBrowserLogInterval(formatCompactNumber(value === 'hz'
                        ? 1000 / Math.min(browserLogIntervalMs, 1000)
                        : Math.max(1, browserLogIntervalMs / 1000)));
                }
            }}>
                <IonicControlSegmentButton controlSize="M44" selectionState={browserLogInputMode === 'hz' ? 'on' : 'off'} tone="accent" value="hz">
                  <IonLabel>Hz</IonLabel>
                </IonicControlSegmentButton>
                <IonicControlSegmentButton controlSize="M44" selectionState={browserLogInputMode === 'seconds' ? 'on' : 'off'} tone="accent" value="seconds">
                  <IonLabel>秒</IonLabel>
                </IonicControlSegmentButton>
              </IonSegment>
              {browserLogInputMode === 'hz' ? (<label className="card-log-settings-field i2c-config-control">
                  <span>アプリログレート</span>
                  <IonSelect aria-label="アプリログレート" data-testid="browser-log-settings-rate-select" value={browserLogDraftIntervalMs ?? undefined} interface="popover" placeholder="選択" onIonChange={(event) => {
                    const intervalMs = Number(event.detail.value);
                    if (isValidBrowserLogIntervalMs(intervalMs)) {
                        setDraftBrowserLogInterval(formatCompactNumber(1000 / intervalMs));
                    }
                }} disabled={browserLogStatus.active}>
                    {BROWSER_LOG_RATE_OPTIONS.map((intervalMs) => (<IonSelectOption key={intervalMs} value={intervalMs}>
                        {formatLogInterval(intervalMs)}
                      </IonSelectOption>))}
                  </IonSelect>
                </label>) : (<label className="card-log-settings-field i2c-config-control">
                  <span>アプリログ周期</span>
                  <IonInput aria-label="アプリログ周期" data-testid="browser-log-settings-input" type="number" inputmode="decimal" value={draftBrowserLogInterval} min={1} max={600} step="1" placeholder="1-600" onIonInput={(event) => setDraftBrowserLogInterval(String(event.detail.value ?? ''))} disabled={browserLogStatus.active}/>
                </label>)}
              <div className="card-log-settings-preview">
                {browserLogDraftIntervalMs ? formatLogInterval(browserLogDraftIntervalMs) : '-'}
              </div>
              {browserLogStatus.active && (<p className="card-log-settings-message">アプリ内ログの記録中は周期を変更できません。</p>)}
              {browserLogSettingsValidationMessage && (<p className="card-log-settings-message">{browserLogSettingsValidationMessage}</p>)}
              <div className="ble-settings-inline-actions">
                <NativeControlButton data-testid="browser-log-settings-save" className="ble-settings-action-button device-setting-save" controlSize="M44" controlVariant="primary" onClick={() => {
                if (browserLogDraftIntervalMs !== null) {
                    onBrowserLogIntervalMsChange(browserLogDraftIntervalMs);
                }
            }} operationalState={getControlOperationalState({
                busy: false,
                disabled: browserLogStatus.active || browserLogSettingsValidationMessage !== null,
                disabledReason: browserLogStatus.active
                    ? 'アプリ内ログの記録中は周期を変更できません'
                    : browserLogSettingsValidationMessage ?? '保存できるログ周期を選択してください',
            })}>
                  <IonIcon icon={save}/>
                  保存
                </NativeControlButton>
              </div>
            </div>
          </>)}
      </SectionCard>

      <BrowserLogStoragePanel status={browserLogStatus} exportBusy={browserLogExportBusy} exportDisabled={browserLogExportDisabled} exportTitle={browserLogExportTitle} preparedArchive={browserLogPreparedArchive} nextExportBatch={browserLogNextExportBatch} exportNotice={browserLogExportNotice} exportError={browserLogExportError} maintenanceOperation={browserLogMaintenanceOperation} maintenanceError={browserLogMaintenanceError} onPrepareExport={onPrepareBrowserLogExport} onDeliverPreparedExport={onDeliverPreparedBrowserLogExport} onPrepareNextExport={onPrepareNextBrowserLogExport} onDiscardPreparedExport={onDiscardPreparedBrowserLogExport} onRefresh={onRefreshBrowserLogs} onDeleteSession={onDeleteBrowserLogSession} onDeleteAll={onDeleteAllBrowserLogs}/>
    </>);
};
