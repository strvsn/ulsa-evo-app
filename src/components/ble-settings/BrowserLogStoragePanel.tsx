import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { IonAlert, IonIcon } from '@ionic/react';
import { closeCircle, refreshCircle, save, shareSocial, trash } from 'ionicons/icons';
import type {
  BrowserLogExportScope,
  BrowserLogPreparedArchive,
  BrowserLogSessionSummary,
  BrowserLogStatus,
} from '../../services/browserLog';
import { getControlOperationalState, NativeControlButton } from '../controls';
import { InfoGrid, SectionCard } from './primitives';

type DeleteRequest =
  | { type: 'session'; session: BrowserLogSessionSummary }
  | { type: 'all' }
  | null;

type FocusRecovery = { type: 'session'; sessionId: string } | { type: 'all' } | null;
type PendingAutoDownload = { scope: BrowserLogExportScope } | null;

type BrowserLogStoragePanelProps = {
  status: BrowserLogStatus;
  exportBusy: boolean;
  exportDisabled: boolean;
  exportTitle: string;
  preparedArchive: BrowserLogPreparedArchive | null;
  nextExportBatch: { sessionId: string | null; batchIndex: number; batchCount: number } | null;
  exportNotice: string | null;
  exportError: string | null;
  maintenanceOperation: 'refresh' | 'delete-all' | string | null;
  maintenanceError: string | null;
  onPrepareExport: (scope?: string | string[]) => void;
  onDeliverPreparedExport: () => void;
  onPrepareNextExport: () => void;
  onDiscardPreparedExport: () => void;
  onRefresh: () => void;
  onDeleteSession: (sessionId: string) => void;
  onDeleteAll: () => void;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

const formatDateTime = (timestamp: number | null, nullLabel: string = '未完了'): string => {
  if (timestamp === null) return nullLabel;
  if (!Number.isFinite(timestamp)) return '取得不可';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp);
};

export const BrowserLogStoragePanel = ({
  status,
  exportBusy,
  preparedArchive,
  nextExportBatch,
  exportNotice,
  exportError,
  maintenanceOperation,
  maintenanceError,
  onPrepareExport,
  onDeliverPreparedExport,
  onPrepareNextExport,
  onDiscardPreparedExport,
  onRefresh,
  onDeleteSession,
  onDeleteAll,
}: BrowserLogStoragePanelProps) => {
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest>(null);
  const [focusRecovery, setFocusRecovery] = useState<FocusRecovery>(null);
  const [pendingAutoDownload, setPendingAutoDownload] = useState<PendingAutoDownload>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const deleteConfirmedRef = useRef(false);
  const operationBusy = exportBusy || maintenanceOperation !== null;
  const storageUsagePercent = status.maxStoredBytes > 0
    ? Math.min(100, Math.max(0, status.storedBytes / status.maxStoredBytes * 100))
    : 0;
  const destructiveDisabled = status.active || operationBusy || preparedArchive !== null || nextExportBatch !== null;
  const nextExpirationAt = useMemo(
    () => status.sessions.length > 0
      ? Math.min(...status.sessions.map((session) => session.expiresAt))
      : null,
    [status.sessions],
  );
  const deleteMessage = deleteRequest?.type === 'session'
    ? `${formatDateTime(deleteRequest.session.startedAt)}開始、${deleteRequest.session.rowCount}行、${formatBytes(deleteRequest.session.sizeBytes)}です。元に戻せません。必要なら先にこのセッションをダウンロードしてください。カード内ログは削除されません。`
    : `保存済みアプリ内ログ${status.storedSessionCount}件、${formatBytes(status.storedBytes)}を削除します。元に戻せません。必要なら先にログをダウンロードしてください。カード内ログは削除されません。`;

  const startAutoDownload = (scope?: string | string[]) => {
    setPendingAutoDownload({ scope: scope ?? null });
    onPrepareExport(scope);
  };

  const startNextAutoDownload = () => {
    if (!nextExportBatch) return;
    setPendingAutoDownload({ scope: nextExportBatch.sessionId });
    onPrepareNextExport();
  };

  useEffect(() => {
    if (!pendingAutoDownload || exportBusy || !preparedArchive) return;
    const scopeMatches = Array.isArray(pendingAutoDownload.scope)
      ? preparedArchive.scopeSessionId === null
      : preparedArchive.scopeSessionId === pendingAutoDownload.scope;
    if (!scopeMatches) return;
    if (Array.isArray(pendingAutoDownload.scope)) setSelectedSessionIds([]);
    setPendingAutoDownload(null);
    onDeliverPreparedExport();
  }, [exportBusy, onDeliverPreparedExport, pendingAutoDownload, preparedArchive]);

  useEffect(() => {
    if (pendingAutoDownload && !exportBusy && preparedArchive === null && exportError !== null) {
      setPendingAutoDownload(null);
    }
  }, [exportBusy, exportError, pendingAutoDownload, preparedArchive]);

  useEffect(() => {
    const available = new Set(status.sessions.map((session) => session.sessionId));
    setSelectedSessionIds((current) => current.filter((sessionId) => available.has(sessionId)));
  }, [status.sessions]);

  useEffect(() => {
    if (!focusRecovery || maintenanceOperation !== null) return;
    const sessionStillExists = focusRecovery.type === 'session' &&
      status.sessions.some((session) => session.sessionId === focusRecovery.sessionId);
    const allStillExist = focusRecovery.type === 'all' && status.sessions.length > 0;
    if ((sessionStillExists || allStillExist) && maintenanceError === null) return;

    const original = maintenanceError === null
      ? null
      : focusRecovery.type === 'session'
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-browser-log-delete-session]'))
          .find((element) => element.dataset.browserLogDeleteSession === focusRecovery.sessionId)
        : document.querySelector<HTMLElement>('[data-testid="browser-log-delete-all"]');
    const nextSessionDelete = document.querySelector<HTMLElement>('[data-browser-log-delete-session]');
    const refresh = document.querySelector<HTMLElement>('[data-testid="browser-log-refresh"]');
    (original ?? nextSessionDelete ?? refresh)?.focus();
    setFocusRecovery(null);
  }, [focusRecovery, maintenanceError, maintenanceOperation, status.sessions]);

  const requestDelete = (request: DeleteRequest, trigger: HTMLElement) => {
    deleteTriggerRef.current = trigger;
    setDeleteRequest(request);
  };

  const confirmDelete = () => {
    deleteConfirmedRef.current = true;
    if (deleteRequest?.type === 'session') {
      setFocusRecovery({ type: 'session', sessionId: deleteRequest.session.sessionId });
      onDeleteSession(deleteRequest.session.sessionId);
    }
    if (deleteRequest?.type === 'all') {
      setFocusRecovery({ type: 'all' });
      onDeleteAll();
    }
    setDeleteRequest(null);
  };

  const selectedSessionSet = useMemo(() => new Set(selectedSessionIds), [selectedSessionIds]);
  const allSessionsSelected = status.sessions.length > 0 && status.sessions.every(
    (session) => selectedSessionSet.has(session.sessionId),
  );
  const selectionDisabled = status.active || operationBusy || preparedArchive !== null || nextExportBatch !== null;
  const toggleSessionSelection = (sessionId: string) => {
    if (selectionDisabled) return;
    setSelectedSessionIds((current) => current.includes(sessionId)
      ? current.filter((id) => id !== sessionId)
      : [...current, sessionId]);
  };
  const toggleAllSessionSelection = () => {
    if (selectionDisabled) return;
    setSelectedSessionIds(allSessionsSelected ? [] : status.sessions.map((session) => session.sessionId));
  };

  return (
    <SectionCard title="アプリ内ログ" icon={save}>
      <div className="browser-log-storage-panel">
        <p className="browser-log-supplemental-note" role="note">
          アプリ内ログは補助記録です。バックグラウンド、画面ロック、BLE切断、OSによるアプリ終了では欠測する場合があります。長時間または確実な記録にはカード内保存を使用してください。
        </p>
        <div className="browser-log-capacity" aria-label="アプリ内ログ保存容量">
          <div className="browser-log-capacity-heading">
            <strong>保存容量</strong>
            <span>{storageUsagePercent.toFixed(storageUsagePercent < 1 ? 2 : 1)}% 使用</span>
          </div>
          <div
            className="browser-log-capacity-track browser-log-capacity-meter"
            role="progressbar"
            aria-label="アプリ内ログ容量使用率"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Number(storageUsagePercent.toFixed(2))}
          >
            <span
              className="browser-log-capacity-used"
              style={{ '--browser-log-capacity-percent': `${storageUsagePercent}%` } as CSSProperties}
            />
          </div>
          <div className="browser-log-capacity-values">
            <span>使用済み <strong>{formatBytes(status.storedBytes)}</strong></span>
            <span>空き <strong>{formatBytes(status.storageRemainingBytes)}</strong></span>
          </div>
        </div>
        <InfoGrid
          rows={[
            { label: 'アプリ内保存', value: status.active ? '記録中' : '停止中' },
            { label: '保存済みログ', value: `${status.storedSessionCount}件` },
            { label: 'CSVファイル', value: `${status.storedSegmentCount}件` },
            { label: '保存行数', value: status.storedRowCount },
            { label: 'ログ使用量', value: `${formatBytes(status.storedBytes)} / ${formatBytes(status.maxStoredBytes)}` },
            { label: 'ログ残量', value: formatBytes(status.storageRemainingBytes) },
            { label: '端末割当残量（推定）', value: status.originRemainingBytes === null ? '取得不可' : formatBytes(status.originRemainingBytes) },
            { label: '実効書込み可能量', value: formatBytes(status.effectiveWritableBytes) },
            { label: '次回自動削除予定', value: formatDateTime(nextExpirationAt, '予定なし') },
            { label: '最終サンプル', value: formatDateTime(status.lastSampleAt, '未記録') },
          ]}
        />
        <p className="browser-log-policy-copy">
          最長{status.retentionDays}日・合計{formatBytes(status.maxStoredBytes)}までです。期限を超えた保存済みログだけを自動削除し、期限内ログは自動削除しません。保存上限、または端末割当残量の安全余裕{formatBytes(status.minFreeBytes)}に達すると記録を安全停止します。ダウンロード後もログは自動削除されません。
        </p>

        {status.storageLimitReached && (
          <p className="browser-log-alert" role="alert">
            保存可能量が不足しています。必要なログをダウンロードし、不要なセッションを削除して状態を更新してから記録を再試行してください。
          </p>
        )}
        {status.error && <p className="browser-log-alert" role="alert">{status.error}</p>}
        {exportError && <p className="browser-log-alert" role="alert">{exportError}</p>}
        {maintenanceError && <p className="browser-log-alert" role="alert">{maintenanceError}</p>}
        {status.maintenanceNotice && (
          <p className="browser-log-status" role="status" aria-live="polite">{status.maintenanceNotice}</p>
        )}
        {exportNotice && (
          <p className="browser-log-status" role="status" aria-live="polite">{exportNotice}</p>
        )}

        <div className="ble-settings-inline-actions browser-log-primary-actions">
          <NativeControlButton
            className="ble-settings-action-button outline"
            controlSize="M44"
            data-testid="browser-log-refresh"
            onClick={onRefresh}
            operationalState={getControlOperationalState({
              busy: maintenanceOperation === 'refresh',
              disabled: status.active || operationBusy || preparedArchive !== null || nextExportBatch !== null,
              disabledReason: status.active
                ? '記録停止後に更新できます'
                : preparedArchive || nextExportBatch ? '分割ZIPをすべて保存または破棄してから更新できます' : '別のログ操作中です',
            })}
          >
            <IonIcon icon={refreshCircle} />
            状態を更新
          </NativeControlButton>
        </div>

        {preparedArchive && (
          <div className="browser-log-prepared" data-testid="browser-log-prepared">
            <p>
              {preparedArchive.file.name}（元データ {formatBytes(preparedArchive.rawBytes)}
              {preparedArchive.batchCount > 1 ? ` / 分割 ${preparedArchive.batchIndex + 1}/${preparedArchive.batchCount}` : ''}）
            </p>
            <div className="ble-settings-inline-actions">
              <NativeControlButton
                className="ble-settings-action-button primary"
                controlSize="M44"
                data-testid="browser-log-deliver"
                onClick={onDeliverPreparedExport}
                operationalState={getControlOperationalState({ busy: exportBusy })}
              >
                <IonIcon icon={shareSocial} />
                共有/保存
              </NativeControlButton>
              <NativeControlButton
                className="ble-settings-action-button outline"
                controlSize="M44"
                data-testid="browser-log-discard-prepared"
                onClick={onDiscardPreparedExport}
                operationalState={getControlOperationalState({ disabled: exportBusy })}
              >
                <IonIcon icon={closeCircle} />
                準備済みZIPを破棄
              </NativeControlButton>
            </div>
          </div>
        )}

        {nextExportBatch && !preparedArchive && (
          <div className="ble-settings-inline-actions">
            <NativeControlButton
              className="ble-settings-action-button primary"
              controlSize="M44"
              data-testid="browser-log-prepare-next"
              onClick={startNextAutoDownload}
              operationalState={getControlOperationalState({ busy: exportBusy })}
            >
              <IonIcon icon={save} />
              次のZIPをダウンロード（{nextExportBatch.batchIndex + 1}/{nextExportBatch.batchCount}）
            </NativeControlButton>
            <NativeControlButton
              className="ble-settings-action-button outline"
              controlSize="M44"
              data-testid="browser-log-stop-batches"
              onClick={onDiscardPreparedExport}
              operationalState={getControlOperationalState({ disabled: exportBusy })}
            >
              分割書き出しを終了
            </NativeControlButton>
          </div>
        )}

        <div className="browser-log-session-list" aria-label="保存済みアプリ内ログ">
          {status.sessions.length === 0 ? (
            <p className="browser-log-empty">保存済みアプリ内ログはありません。</p>
          ) : <>
            <div className="browser-log-session-toolbar">
              <label className="browser-log-select-all">
                <input
                  type="checkbox"
                  checked={allSessionsSelected}
                  disabled={selectionDisabled}
                  onChange={toggleAllSessionSelection}
                  aria-label="すべてのログを選択"
                />
                すべて選択
              </label>
              <NativeControlButton
                className="ble-settings-action-button primary"
                controlSize="C36"
                data-testid="browser-log-download-selected"
                onClick={() => startAutoDownload(selectedSessionIds)}
                operationalState={getControlOperationalState({
                  disabled: selectionDisabled || selectedSessionIds.length === 0,
                  disabledReason: selectionDisabled
                    ? status.active ? '記録停止後にダウンロードできます' : '別のログ操作中です'
                    : 'ログを選択してください',
                })}
              >
                <IonIcon icon={save} />
                選択したログをダウンロード
              </NativeControlButton>
            </div>
            <div className="browser-log-session-table-wrap">
              <table className="browser-log-session-table">
                <thead>
                  <tr>
                    <th scope="col" aria-label="選択" />
                    <th scope="col">開始</th>
                    <th scope="col">内容</th>
                    <th scope="col">自動削除</th>
                    <th scope="col" aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {status.sessions.map((session) => (
                    <tr data-testid={`browser-log-session-${session.sessionId}`} key={session.sessionId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedSessionSet.has(session.sessionId)}
                          disabled={selectionDisabled}
                          onChange={() => toggleSessionSelection(session.sessionId)}
                          aria-label={`${formatDateTime(session.startedAt)}開始のログを選択`}
                        />
                      </td>
                      <td><time dateTime={new Date(session.startedAt).toISOString()}>{formatDateTime(session.startedAt)}</time></td>
                      <td>{session.segmentCount} CSV / {session.rowCount}行 / {formatBytes(session.sizeBytes)}</td>
                      <td>{formatDateTime(session.expiresAt)}</td>
                      <td>
                        <div className="browser-log-session-actions">
                          <NativeControlButton
                            className="ble-settings-action-button outline"
                            controlSize="C36"
                            data-testid={`browser-log-export-${session.sessionId}`}
                            onClick={() => startAutoDownload(session.sessionId)}
                            operationalState={getControlOperationalState({
                              busy: exportBusy,
                              disabled: selectionDisabled,
                              disabledReason: status.active ? '記録停止後にダウンロードできます' : '別のログ操作です',
                            })}
                          >
                            <IonIcon icon={save} />
                            ダウンロード
                          </NativeControlButton>
                          <NativeControlButton
                            className="ble-settings-action-button outline"
                            controlSize="C36"
                            controlVariant="destructive"
                            tone="danger"
                            data-testid={`browser-log-delete-${session.sessionId}`}
                            data-browser-log-delete-session={session.sessionId}
                            aria-label={`${formatDateTime(session.startedAt)}開始のアプリ内ログを削除`}
                            onClick={(event) => requestDelete({ type: 'session', session }, event.currentTarget)}
                            operationalState={getControlOperationalState({
                              busy: maintenanceOperation === session.sessionId,
                              disabled: destructiveDisabled,
                              disabledReason: status.active
                                ? '記録停止後に削除できます'
                                : preparedArchive || nextExportBatch ? 'ダウンロードを保存または破棄してから削除できます' : '別のログ操作です',
                            })}
                          >
                            <IonIcon icon={trash} />
                            削除
                          </NativeControlButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
        </div>

        <NativeControlButton
          className="ble-settings-action-button outline browser-log-delete-all"
          controlSize="M44"
          controlVariant="destructive"
          tone="danger"
          data-testid="browser-log-delete-all"
          onClick={(event) => requestDelete({ type: 'all' }, event.currentTarget)}
          operationalState={getControlOperationalState({
            busy: maintenanceOperation === 'delete-all',
            disabled: destructiveDisabled || status.storedSessionCount === 0,
            disabledReason: status.active
              ? '記録停止後に削除できます'
              : preparedArchive || nextExportBatch
                ? 'ZIPを保存または破棄してから削除できます'
                : status.storedSessionCount === 0 ? '削除するログがありません' : '別のログ操作中です',
          })}
        >
          <IonIcon icon={trash} />
          保存済みアプリ内ログをすべて削除
        </NativeControlButton>

        <IonAlert
          isOpen={deleteRequest !== null}
          header={deleteRequest?.type === 'all'
            ? '保存済みアプリ内ログをすべて削除しますか？'
            : 'このアプリ内ログを削除しますか？'}
          message={deleteMessage}
          backdropDismiss
          buttons={[
            { text: 'キャンセル', role: 'cancel' },
            { text: '削除する', role: 'destructive', handler: confirmDelete },
          ]}
          onDidDismiss={() => {
            setDeleteRequest(null);
            if (!deleteConfirmedRef.current) deleteTriggerRef.current?.focus();
            deleteConfirmedRef.current = false;
          }}
        />
      </div>
    </SectionCard>
  );
};
