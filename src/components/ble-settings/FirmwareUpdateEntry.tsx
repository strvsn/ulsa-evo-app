import type { ReactNode } from 'react';
import { IonSelect, IonSelectOption } from '@ionic/react';
import { CloudUpload, RefreshCw } from 'lucide-react';
import { NativeControlButton } from '../controls';
import { SectionCard } from './primitives';
import type { FirmwareReleaseNotes } from '../../services/ota/firmwareReleaseCatalog';
import './styles/firmware-update-wizard.css';

const formatPublishedDate = (value: string | undefined): string | null => {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
};

const ReleasePublishedDate = ({ value }: { value: string | undefined }) => {
  const date = formatPublishedDate(value);
  return <p className="firmware-release-date">公開日：{date
    ? <time dateTime={value}>{date}</time> : '未登録'}</p>;
};

export const FirmwareUpdateEntry = ({
  target, description, releases, selectedId, onSelect, disabled, busy, actionLabel,
  onOpen, onReload, error, selectedRelease, children,
}: {
  target: 'ESP32' | 'STM32';
  description: string;
  releases: { id: string; label: string }[];
  selectedRelease?: { publishedAt?: string; releaseNotes?: FirmwareReleaseNotes } | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled: boolean;
  busy: boolean;
  actionLabel?: string;
  onOpen: () => void;
  onReload: () => void;
  error?: string | null;
  children?: ReactNode;
}) => <SectionCard title={target === 'STM32' ? (
  <span className="firmware-update-entry-heading">
    <span>STM32 FW更新</span>
    <small>（超音波制御モジュール）</small>
  </span>
) : `${target} FW更新`} icon={<CloudUpload size={18} aria-hidden="true" />}
  actions={<NativeControlButton controlSize="I44" className="ble-settings-action-button ghost"
    aria-label={`${target}の更新情報を再取得`} onClick={onReload} disabled={busy}>
    <RefreshCw size={18} aria-hidden="true" />
  </NativeControlButton>}>
  <div className="firmware-update-entry">
    <p>{description}</p>
    <label>更新するバージョン
      <IonSelect
        className="firmware-release-select"
        interface="popover"
        interfaceOptions={{ cssClass: 'firmware-release-select-popover' }}
        aria-label={`${target}の更新バージョン`}
        value={selectedId ?? ''}
        disabled={busy || releases.length === 0}
        onIonChange={(event) => onSelect(String(event.detail.value || '') || null)}
      >
        {releases.length === 0 && (
          <IonSelectOption value="">{busy ? '更新情報を確認中…' : '更新データがありません'}</IonSelectOption>
        )}
        {releases.map((release) => (
          <IonSelectOption key={release.id} value={release.id}>{release.label}</IonSelectOption>
        ))}
      </IonSelect>
    </label>
    <NativeControlButton controlSize="M44" controlVariant="primary" className="firmware-update-entry-primary"
      onClick={onOpen} disabled={disabled}>{actionLabel ?? '更新を準備'}</NativeControlButton>
    {error && <p className="firmware-update-entry-message" role="alert" aria-live="assertive">{error}</p>}
    {selectedRelease && (
      <details className="firmware-release-notes">
        <summary>変更内容・更新情報</summary>
        <div className="firmware-release-notes-body">
          <ReleasePublishedDate value={selectedRelease.publishedAt} />
          {selectedRelease.releaseNotes ? <>
          <section aria-labelledby={`${target.toLowerCase()}-release-notes-ja`}>
            <h4 id={`${target.toLowerCase()}-release-notes-ja`}>日本語</h4>
            <ul>{selectedRelease.releaseNotes.ja.map((note) => <li key={`ja-${note}`}>{note}</li>)}</ul>
          </section>
          <section aria-labelledby={`${target.toLowerCase()}-release-notes-en`}>
            <h4 id={`${target.toLowerCase()}-release-notes-en`}>English</h4>
            <ul>{selectedRelease.releaseNotes.en.map((note) => <li key={`en-${note}`}>{note}</li>)}</ul>
          </section>
          </> : <p className="firmware-release-notes-missing">変更内容は登録されていません。</p>}
        </div>
      </details>
    )}
    {children}
  </div>
</SectionCard>;
