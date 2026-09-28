import { IonIcon, IonInput, IonList, IonSelect, IonSelectOption, } from '@ionic/react';
import { refreshCircle, save, settings } from 'ionicons/icons';
import type { I2cConfigStatus, I2cConfigWriteRequest } from '../../types/ble';
import { getI2cResultLabel, getI2cBootFaultMessage, parseI2cAddressInput, } from './formatters';
import { InfoGrid, SectionCard, StatusItem, StatusSummary } from './primitives';
import { getControlOperationalState, IonicControlButton } from '../controls';
const SHOW_I2C_ADDRESS_EDITOR = false;
type I2cPanelProps = {
    status: I2cConfigStatus | null;
    busy: boolean;
    writable: boolean;
    draftNodeId: string;
    draftAvgCycle: number;
    draftWindMode: number;
    draftI2cAddress: string;
    onDraftNodeIdChange: (value: string) => void;
    onDraftAvgCycleChange: (value: number) => void;
    onDraftWindModeChange: (value: number) => void;
    onDraftI2cAddressChange: (value: string) => void;
    onSetAndSave: (request: I2cConfigWriteRequest) => void;
    onWrite: (request: I2cConfigWriteRequest) => void;
    onRestoreDefaultsClick: () => void;
};
const submitNumberConfig = (onWrite: (request: I2cConfigWriteRequest) => void, op: I2cConfigWriteRequest['op'], value: number | null) => {
    if (value === null || Number.isNaN(value))
        return;
    onWrite({ op, value });
};
export const I2cPanel = ({ status, busy, writable, draftNodeId, draftAvgCycle, draftWindMode, draftI2cAddress, onDraftNodeIdChange, onDraftAvgCycleChange, onDraftWindModeChange, onDraftI2cAddressChange, onSetAndSave, onWrite, onRestoreDefaultsClick, }: I2cPanelProps) => {
    const bootFaultMessage = status ? getI2cBootFaultMessage(status.remoteRegisterVersion, status.remoteLastError) : null;
    const supportMessage = bootFaultMessage ?? (!status ? '本体に接続して、設定を読み込んでください。'
        : !status.detected ? '本体の計測部と通信できません。電源を入れ直してから再接続してください。'
            : !status.configWriteSupported ? 'このファームウェアでは設定を変更できません。本体の更新をご確認ください。' : null);
    const writeOperationalState = getControlOperationalState({
        busy,
        disabled: !writable || bootFaultMessage !== null,
        disabledReason: 'BLE未接続またはI2C設定の書き込みに未対応です',
    });
    return (<SectionCard title={'計測設定'} icon={settings}>
      {supportMessage && (<p className="i2c-config-support-message" role={bootFaultMessage ? 'alert' : undefined}>{supportMessage}</p>)}
      {status ? (<>
          <StatusSummary>
            <StatusItem tone={bootFaultMessage || !status.detected ? 'critical' : 'neutral'}>
              {bootFaultMessage ? '計測部起動異常' : status.detected ? '本体と接続済み' : '本体の接続を確認'}
            </StatusItem>
            <StatusItem tone={!bootFaultMessage && status.configWriteSupported ? 'neutral' : 'attention'}>
              {!bootFaultMessage && status.configWriteSupported ? '設定可' : '設定不可'}
            </StatusItem>
            {status.rebootRequired && <StatusItem tone="attention">再起動待ち</StatusItem>}
            {status.configFlags !== 0 && <StatusItem tone="attention">未保存</StatusItem>}
          </StatusSummary>
          <InfoGrid rows={[
                { label: '状態', value: getI2cResultLabel(status) }
            ]}/>
          {false}
          <IonList lines="full" className="i2c-config-list">
            <div className="i2c-config-row">
              <label className="i2c-config-control">
                <span>Node ID</span>
                <IonInput aria-label="Node ID" data-testid="i2c-node-id-input" type="number" min={0} max={255} value={draftNodeId} onIonInput={(event) => onDraftNodeIdChange(String(event.detail.value ?? ''))}/>
              </label>
              <IonicControlButton controlSize="M44" fill="solid" className="i2c-config-apply device-setting-save" operationalState={writeOperationalState} data-testid="i2c-node-id-set" onClick={() => submitNumberConfig(onSetAndSave, 'setNodeId', Number.parseInt(draftNodeId, 10))}>
                <IonIcon icon={save} slot="start"/>
                保存
              </IonicControlButton>
            </div>
            <p className="i2c-node-id-help">センサーを見分けるため、0〜255の任意の番号を設定できます。</p>
            <div className="i2c-config-row">
              <label className="i2c-config-control">
                <span>平均回数</span>
                <IonSelect aria-label="平均回数" interface="popover" value={draftAvgCycle} onIonChange={(event) => onDraftAvgCycleChange(Number(event.detail.value))}>
                  {[1, 4, 8, 16, 32, 64].map((value) => (<IonSelectOption key={value} value={value}>{value}</IonSelectOption>))}
                </IonSelect>
              </label>
              <IonicControlButton controlSize="M44" fill="solid" className="i2c-config-apply device-setting-save" operationalState={writeOperationalState} onClick={() => submitNumberConfig(onSetAndSave, 'setAvgCycle', draftAvgCycle)}>
                <IonIcon icon={save} slot="start"/>
                保存
              </IonicControlButton>
            </div>
            <p className="i2c-node-id-help">風速計測に使用する移動平均フィルターの回数です。大きいほど表示が安定し、変化への追従はゆっくりになります。</p>
            <div className="i2c-config-row">
              <label className="i2c-config-control">
                <span>風向取付</span>
                <IonSelect aria-label="風向取付" interface="popover" value={draftWindMode} onIonChange={(event) => onDraftWindModeChange(Number(event.detail.value))}>
                  <IonSelectOption value={0}>Normal</IonSelectOption>
                  <IonSelectOption value={1}>Inverted</IonSelectOption>
                </IonSelect>
              </label>
              <IonicControlButton controlSize="M44" fill="solid" className="i2c-config-apply device-setting-save" operationalState={writeOperationalState} onClick={() => submitNumberConfig(onSetAndSave, 'setWindDirInstallMode', draftWindMode)}>
                <IonIcon icon={save} slot="start"/>
                保存
              </IonicControlButton>
            </div>
            <p className="i2c-node-id-help">通常設置はNormal、天面を反転して設置する場合はInvertedを選びます。反転設置時の風向回転方向を補正します。</p>
            {SHOW_I2C_ADDRESS_EDITOR && (<div className="i2c-config-row">
                <label className="i2c-config-control">
                  <span>I2C Address</span>
                  <IonInput aria-label="I2C Address" data-testid="i2c-address-input" value={draftI2cAddress} onIonInput={(event) => onDraftI2cAddressChange(String(event.detail.value ?? ''))}/>
                </label>
                <IonicControlButton controlSize="M44" fill="solid" className="i2c-config-apply device-setting-save" operationalState={writeOperationalState} onClick={() => submitNumberConfig(onSetAndSave, 'setI2cAddress', parseI2cAddressInput(draftI2cAddress))}>
                  <IonIcon icon={save} slot="start"/>
                  保存
                </IonicControlButton>
              </div>)}
          </IonList>
          <p className="i2c-config-note">
            「保存」で変更内容を本体へ保存します。Node IDは保存後にSTM32の実行値へ反映されます。風向取付の変更はデバイス再起動後に有効になります。操作後の状態は自動で更新されます。
          </p>
        </>) : (<p>I2C設定値は未取得です。</p>)}
      <div className="i2c-config-actions">
        <IonicControlButton fill="outline" controlSize="M44" controlVariant="destructive" tone="danger" operationalState={writeOperationalState} onClick={onRestoreDefaultsClick}>
          <IonIcon icon={refreshCircle} slot="start"/>
          デフォルトに復元
        </IonicControlButton>
        <IonicControlButton fill="clear" controlSize="C36" controlVariant="ghost" operationalState={writeOperationalState} onClick={() => onWrite({ op: 'clearError' })}>
          エラークリア
        </IonicControlButton>
      </div>
    </SectionCard>);
};
