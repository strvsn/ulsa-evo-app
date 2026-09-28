import { IonIcon } from '@ionic/react';
import { globeOutline, save, sync, time } from 'ionicons/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceHealthStatus, RtcTimeStatus } from '../../types/ble';
import {
  getDeviceTimezoneCandidate,
  getTimezoneByName,
  TIMEZONE_CATALOG,
} from '../../services/timezoneCatalog';
import {
  getControlOperationalState,
  IonicControlButton,
  NativeControlButton,
} from '../controls';
import { formatReadTime, formatRtcOffset } from './formatters';
import { InfoGrid, SectionCard, StatusItem, StatusSummary, type StatusTone } from './primitives';

type TimePanelProps = {
  rtcTimeStatus: RtcTimeStatus;
  deviceHealthStatus: DeviceHealthStatus | null;
  timezoneCapability?: boolean | null;
  deviceKey?: string | null;
  onRefreshRtcTime: () => void;
  onSyncTime: (zoneId: number) => void;
  onSetRtcTimezone: (zoneId: number) => void;
};

type RtcHealthBadge = {
  tone: StatusTone;
  label: string;
  message: string | null;
};

const getRtcHealthBadge = (status: DeviceHealthStatus | null): RtcHealthBadge => {
  if (!status) return { tone: 'neutral', label: 'RTC状態を確認中', message: null };
  if (!status.rtcPresent) return {
    tone: 'attention', label: 'RTC使用不可・未検出',
    message: 'RTCモジュールへ応答がありません。接続と電源を確認してください。',
  };
  if (!status.rtcAvailable) return {
    tone: 'attention', label: 'RTC使用不可・通信エラー',
    message: 'RTCは検出済みですが、現在のI2C読出しに失敗しています。',
  };
  if (status.protocolVersion >= 2 && status.rtcVoltageLow) return {
    tone: 'attention', label: 'RTC使用不可・電池なし／電圧低下',
    message: 'RTCバックアップ電池が未装着、または電圧が低下しています。電池を確認してから時刻と地域を同期してください。',
  };
  if (status.protocolVersion >= 2 && !status.rtcTimeValid) return {
    tone: 'attention',
    label: status.rtcClockStopped ? 'RTC使用不可・停止中' : 'RTC利用可能・要同期',
    message: 'RTCの時刻は未確定です。時刻と地域を同期してください。',
  };
  if (!status.rtcRunning) return {
    tone: 'attention', label: 'RTC使用不可・停止中',
    message: 'RTCクロックが停止しています。時刻と地域を同期してください。',
  };
  return { tone: 'neutral', label: 'RTC利用可能', message: null };
};

const formatUtcOffset = (minutes: number | null): string => {
  if (minutes === null) return '-';
  const sign = minutes >= 0 ? '+' : '-';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
};

const formatDeviceLocalTime = (status: RtcTimeStatus): string => {
  if (!status.zoneName || status.deviceEpochSeconds === null ||
      status.totalUtcOffsetMinutes === null) return '-';
  const local = new Date(
    (status.deviceEpochSeconds + status.totalUtcOffsetMinutes * 60) * 1000
  );
  if (Number.isNaN(local.getTime())) return '-';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${local.getUTCFullYear()}/${pad(local.getUTCMonth() + 1)}/${pad(local.getUTCDate())} `
    + `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
};

export const TimePanel = ({
  rtcTimeStatus,
  deviceHealthStatus,
  timezoneCapability = null,
  deviceKey = null,
  onRefreshRtcTime,
  onSyncTime,
}: TimePanelProps) => {
  const rtcHealthBadge = getRtcHealthBadge(deviceHealthStatus);
  const deviceCandidate = useMemo(() => getDeviceTimezoneCandidate(), []);
  const [zoneQuery, setZoneQuery] = useState('');
  const selectionSourceRef = useRef<string | null>(null);
  const operationBusy = rtcTimeStatus.operationBusy
    || rtcTimeStatus.syncState === 'settingZone'
    || rtcTimeStatus.syncState === 'syncing';

  useEffect(() => {
    const source = `${deviceKey ?? ''}\0${rtcTimeStatus.zoneName ?? ''}`;
    if (selectionSourceRef.current === source) return;
    selectionSourceRef.current = source;
    setZoneQuery(rtcTimeStatus.zoneName || deviceCandidate?.name || '');
  }, [deviceCandidate, deviceKey, rtcTimeStatus.zoneName]);

  const selectedZone = getTimezoneByName(zoneQuery.trim());
  const suggestions = useMemo(() => {
    const needle = zoneQuery.trim().toLocaleLowerCase();
    if (needle.length < 2 || selectedZone) return [];
    return TIMEZONE_CATALOG.zones
      .filter((zone) => zone.name.toLocaleLowerCase().includes(needle))
      .slice(0, 12);
  }, [selectedZone, zoneQuery]);
  const unsupported = rtcTimeStatus.supported === false || timezoneCapability === false;
  const controlDisabled = unsupported || !selectedZone;
  const controlDisabledReason = unsupported
    ? '接続中のfirmwareはRTC地域設定に対応していません'
    : 'カタログにある地域を選択してください';

  return (
    <SectionCard title="RTC時刻・地域" icon={time}>
      <div className="rtc-availability-summary">
        <StatusSummary>
          <StatusItem tone={rtcHealthBadge.tone}>{rtcHealthBadge.label}</StatusItem>
          {unsupported && <StatusItem tone="attention">地域設定非対応</StatusItem>}
        </StatusSummary>
      </div>

      <InfoGrid rows={[
        { label: '本体の地域', value: rtcTimeStatus.zoneName ?? (rtcTimeStatus.zoneConfigured ? `未解決 ID ${rtcTimeStatus.zoneId}` : '未設定') },
        { label: '現在のUTC差', value: formatUtcOffset(
          rtcTimeStatus.zoneName ? rtcTimeStatus.totalUtcOffsetMinutes : null
        ) },
        { label: '本体の現地時刻', value: formatDeviceLocalTime(rtcTimeStatus) },
        { label: 'RTCと端末の差', value: formatRtcOffset(rtcTimeStatus.offsetMs, rtcTimeStatus.offsetAssessment) },
        { label: 'TZDB', value: rtcTimeStatus.tzdbVersion ?? '-' },
        { label: '最終取得', value: formatReadTime(rtcTimeStatus.lastReadAt) },
      ]} />

      {unsupported && (
        <p className="ble-settings-note">通常計測は継続できます。時刻・地域設定には対応firmwareへの更新が必要です。旧RTC値の自動移行は行いません。</p>
      )}
      {rtcTimeStatus.readError && <p className="ble-settings-note">{rtcTimeStatus.readError}</p>}
      {rtcHealthBadge.message && <p className="ble-settings-note">{rtcHealthBadge.message}</p>}

      <div className="rtc-timezone-controls">
        <div className="rtc-timezone-candidate">
          <span>端末の地域</span>
          <strong>{deviceCandidate?.name ?? '取得できません／手動選択が必要'}</strong>
          <IonicControlButton
            fill="outline"
            controlSize="C36"
            onClick={() => deviceCandidate && setZoneQuery(deviceCandidate.name)}
            operationalState={getControlOperationalState({
              busy: operationBusy,
              disabled: unsupported || !deviceCandidate,
              disabledReason: unsupported ? controlDisabledReason : '端末地域を利用できません',
            })}
          >
            <IonIcon icon={globeOutline} slot="start" />
            端末地域を使う
          </IonicControlButton>
        </div>

        <label className="rtc-timezone-search-label" htmlFor="rtc-timezone-search">
          地域を検索して変更
        </label>
        <input
          id="rtc-timezone-search"
          className="rtc-timezone-search"
          type="search"
          value={zoneQuery}
          placeholder="Asia/Tokyo"
          autoComplete="off"
          disabled={unsupported || operationBusy}
          onChange={(event) => setZoneQuery(event.currentTarget.value)}
          aria-invalid={zoneQuery.length > 0 && !selectedZone}
          aria-describedby="rtc-timezone-selection-status"
        />
        <p id="rtc-timezone-selection-status" className="ble-settings-note">
          {selectedZone
            ? `選択中: ${selectedZone.name}`
            : '地域名を入力し、カタログの候補から選択してください。本体へは自動送信しません。'}
        </p>
        {suggestions.length > 0 && (
          <div className="rtc-timezone-results" role="listbox" aria-label="地域候補">
            {suggestions.map((zone) => (
              <NativeControlButton
                key={zone.zoneId}
                controlSize="C36"
                controlVariant="ghost"
                role="option"
                aria-selected={false}
                onClick={() => setZoneQuery(zone.name)}
              >
                {zone.name}
              </NativeControlButton>
            ))}
          </div>
        )}
      </div>

      <div className="ble-settings-inline-actions rtc-time-actions">
        <IonicControlButton fill="outline" controlSize="C36" onClick={onRefreshRtcTime}>
          <IonIcon icon={sync} slot="start" />
          更新
        </IonicControlButton>
        <IonicControlButton
          fill="solid"
          controlSize="M44"
          controlVariant="primary"
          className="device-setting-save"
          data-testid="rtc-time-sync"
          onClick={() => selectedZone && onSyncTime(selectedZone.zoneId)}
          operationalState={getControlOperationalState({ busy: operationBusy, disabled: controlDisabled, disabledReason: controlDisabledReason })}
        >
          <IonIcon icon={save} slot="start" />
          {rtcTimeStatus.syncState === 'syncing' ? '同期中...' : '時刻と地域を同期'}
        </IonicControlButton>
      </div>
    </SectionCard>
  );
};
