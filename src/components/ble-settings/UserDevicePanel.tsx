import { Lightbulb, RadioTower, RotateCw } from 'lucide-react';
import type { DevicePanelProps } from './DevicePanel';
import { NativeControlButton } from '../controls';
import { InfoGrid, SectionCard } from './primitives';
import { LedBrightnessLevelSelector } from './LedBrightnessLevelSelector';
import { getI2cBootFaultMessage } from './formatters';

export const UserDevicePanel = (props: DevicePanelProps) => {
  const version = props.stm32FirmwareVersion;
  const bootFaultMessage = props.deviceHealthStatus
    ? getI2cBootFaultMessage(props.deviceHealthStatus.stm32RegisterVersion, props.deviceHealthStatus.stm32LastError)
    : null;
  if (props.section === 'firmware') return (
    <SectionCard title="本体情報" icon={<RadioTower size={18} aria-hidden="true" />}>
      <InfoGrid rows={[
        { label: '製造者', value: props.deviceInfo?.manufacturerName || '—' },
        { label: 'モデル', value: props.deviceInfo?.modelNumber || 'ULSA EVO' },
        { label: 'ESP32ファームウェア', value: props.deviceInfo?.firmwareRevision || '未取得' },
        { label: 'STM32ファームウェア', value: version?.readOk && version.firmwareVersion ? version.firmwareVersion : '未取得' },
      ]} />
      <p className="ble-settings-note">ESP32はBLE接続やカード保存、STM32は風向・風速の計測を担当します。</p>
      {!props.isConnected && <p className="ble-settings-note">本体にBLE接続すると、バージョンを取得できます。</p>}
      {props.firmwareInfoError && <p className="ble-settings-message danger" role="alert">{props.firmwareInfoError}</p>}
      {bootFaultMessage && <div className="ble-settings-message danger" role="alert">{bootFaultMessage}</div>}
      <NativeControlButton controlSize="M44" className="ble-settings-action-button outline"
        disabled={!props.isConnected || props.firmwareInfoBusy}
        onClick={props.onRefreshFirmwareVersions ?? props.onRefreshStm32FirmwareVersion}>
        {props.firmwareInfoBusy ? 'バージョンを取得中…' : 'バージョンを再確認'}
      </NativeControlButton>
    </SectionCard>
  );

  return <>
    <SectionCard title="LEDの明るさ" icon={<Lightbulb size={18} aria-hidden="true" />}>
      {props.ledBrightnessStatus ? <>
        <LedBrightnessLevelSelector value={props.draftLedBrightness}
          isUpsideDown={props.isUpsideDown}
          disabled={!props.isConnected || props.ledBrightnessSupported === false || props.ledBrightnessBusy}
          onChange={(brightness) => {
            if (brightness === props.draftLedBrightness) return;
            props.onDraftLedBrightnessChange(brightness);
            props.onSetLedBrightness(brightness);
          }} />
        <p>設定は本体に保存されます。</p>
      </> : <p>{!props.isConnected ? '本体に接続すると変更できます。' : props.ledBrightnessSupported === false
        ? 'この本体は明るさの変更に対応していません。' : '設定を読み込んでいます。'}</p>}
    </SectionCard>
    <SectionCard title="接続や計測がうまくいかないとき" icon={<RotateCw size={18} aria-hidden="true" />}>
      {bootFaultMessage && <div className="ble-settings-message danger" role="alert">{bootFaultMessage}</div>}
      <p>本体の電源を入れ直し、BLEで再接続してください。解決しない場合は「情報」のサポート窓口をご利用ください。</p>
    </SectionCard>
  </>;
};
