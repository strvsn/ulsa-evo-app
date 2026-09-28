import {
  IonHeader,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import {
  CloudDownload,
  Copy,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Esp32OtaUploadProgress } from '../../services/ota/esp32OtaTransfer';
import type { Esp32FirmwareReleaseOption } from '../../services/ota/firmwareReleaseCatalog';
import { INITIAL_DEMO_SOFT_AP } from '../../services/ota/initialDemoOta';
import { ControlIconButton, IonicControlButton } from '../controls';
import type { OtaConnectionPhase } from './otaPanelHelpers';
import { FirmwareUpdateProduct as ProductVisual, type FirmwareProductStage as SetupStage } from './FirmwareUpdateProduct';
import { firmwareUpdateError } from './firmwareUpdateError';
import './styles/initial-firmware-setup-wizard.css';

type Message = { text: string; role: 'status' | 'alert' } | null;

type Props = {
  isOpen: boolean;
  defaultHideNextTime: boolean;
  initialSetupSupported: boolean;
  selectedRelease: Esp32FirmwareReleaseOption | null;
  firmwareCatalogBusy: boolean;
  firmwareDownloadBusy: boolean;
  selectedFirmwareReady: boolean;
  canDownloadFirmware: boolean;
  connectionFlowBusy: boolean;
  connectionPhase: OtaConnectionPhase;
  networkReady: boolean;
  canStartUpdateNetwork: boolean;
  transferBusy: boolean;
  uploadProgress: Esp32OtaUploadProgress | null;
  canUpload: boolean;
  setupComplete: boolean;
  transferComplete: boolean;
  message: Message;
  autoJoinAvailable: boolean;
  requiresManualBleConnection: boolean;
  onCacheFirmware: () => void;
  onStartUpdateNetwork: () => void;
  onRetryInitialConnection: () => void;
  onUpload: () => void;
  onRetryVerification: () => void;
  onHideNextTimeChange?: (hideNextTime: boolean) => void;
  onDismiss: () => void;
};

const INTRO_CONSENTS = [
  {
    id: 'evaluation',
    title: '評価・開発用デモファームウェア',
    detail: 'これからインストールするのは、評価・開発用の「デモファームウェア」です。',
  },
  {
    id: 'operation',
    title: '動作保証はありません',
    detail: 'ファームウェアおよび計測アプリの完全な動作を保証するものではありません。',
  },
  {
    id: 'warranty',
    title: '保証・補償について',
    detail: 'インストールや利用による不具合・損害は補償できません。ただし、適用法令上免責できない責任は除きます。',
  },
  {
    id: 'openSource',
    title: 'オープンソースとして公開',
    detail: 'ファームウェアおよび計測アプリのソースコードは公開されています。各ライセンスの条件に従って、自由に確認・改善・改変できます。',
  },
] as const;

type IntroConsentId = typeof INTRO_CONSENTS[number]['id'];
const emptyIntroConsents = (): Record<IntroConsentId, boolean> => ({
  evaluation: false,
  operation: false,
  warranty: false,
  openSource: false,
});

const SetupProgress = ({ stage }: { stage: SetupStage }) => {
  if (stage === 'intro') return null;
  const current = stage === 'download' ? 1 : stage === 'button' ? 2 : 3;
  return (
    <ol className="initial-setup-progress" aria-label="デモファームウェア設定の進捗">
      {['取得', '本体操作', 'インストール'].map((label, index) => {
        const step = index + 1;
        const completed = step < current || stage === 'complete';
        return (
          <li key={label} className={completed ? 'complete' : step === current ? 'current' : ''}
            aria-current={step === current && stage !== 'complete' ? 'step' : undefined}>
            <span>{completed ? '✓' : step}</span><small>{label}</small>
          </li>
        );
      })}
    </ol>
  );
};

const InitialProgressRing = ({ durationMs, measuredPercent }: {
  durationMs?: number;
  measuredPercent?: number;
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (durationMs === undefined) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [durationMs]);
  const percent = measuredPercent === undefined
    ? Math.min(95, Math.max(0, Math.floor(elapsedMs / (durationMs ?? 1) * 100)))
    : Math.min(100, Math.max(0, measuredPercent));
  return <span className="initial-setup-progress-ring" data-testid="initial-setup-progress-ring"
    data-progress-kind={measuredPercent === undefined ? 'estimated' : 'measured'} aria-hidden="true"
    style={{ '--initial-progress': `${percent}%` } as CSSProperties} />;
};

export const InitialFirmwareSetupWizardView = ({
  isOpen, defaultHideNextTime, initialSetupSupported, selectedRelease,
  firmwareCatalogBusy, firmwareDownloadBusy, selectedFirmwareReady,
  canDownloadFirmware, connectionFlowBusy, connectionPhase, networkReady,
  canStartUpdateNetwork, transferBusy, uploadProgress, canUpload,
  setupComplete, transferComplete, message, autoJoinAvailable, requiresManualBleConnection,
  onCacheFirmware, onStartUpdateNetwork, onRetryInitialConnection, onUpload, onRetryVerification,
  onHideNextTimeChange = () => undefined, onDismiss,
}: Props) => {
  const [introComplete, setIntroComplete] = useState(false);
  const [introConsents, setIntroConsents] = useState(emptyIntroConsents);
  const [hideNextTime, setHideNextTime] = useState(defaultHideNextTime);
  const [passwordCopyMessage, setPasswordCopyMessage] = useState('');
  const dismissedRef = useRef(false);
  const wasOpenRef = useRef(false);
  const downloadAttemptedRef = useRef(false);
  const copyWifiPassword = async () => {
    try {
      await navigator.clipboard.writeText(INITIAL_DEMO_SOFT_AP.password);
      setPasswordCopyMessage('コピーしました');
    } catch {
      setPasswordCopyMessage('コピーできませんでした。パスワードを手入力してください。');
    }
  };
  const busy = firmwareCatalogBusy || firmwareDownloadBusy || connectionFlowBusy || transferBusy;
  const connectionStage = connectionPhase === 'softAp' || connectionPhase === 'iosPrompt' || connectionPhase === 'wifi';
  const introConsentAccepted = INTRO_CONSENTS.every(({ id }) => introConsents[id]);
  const userError = message?.role === 'alert' ? firmwareUpdateError(message.text) : null;
  const stage: SetupStage = !introComplete ? 'intro'
    : setupComplete ? 'complete'
      : transferComplete && !transferBusy ? 'verification'
        : transferBusy || networkReady ? 'transfer'
          : connectionStage ? 'connection'
            : selectedFirmwareReady ? 'button' : 'download';
  const measuredPercent = stage === 'transfer' && transferBusy && !transferComplete
    && typeof uploadProgress?.percent === 'number' ? uploadProgress.percent : undefined;
  const estimatedDurationMs = !busy ? undefined
    : stage === 'download' ? 20_000
      : stage === 'connection' && connectionPhase === 'softAp' ? 3_500
        : stage === 'connection' && connectionPhase === 'wifi' && autoJoinAvailable ? 45_000
          : stage === 'transfer' && transferComplete ? 60_000
            : stage === 'transfer' && measuredPercent === undefined ? 30_000 : undefined;
  const busyText = stage === 'download' ? '更新データを準備しています'
    : stage === 'connection' && connectionPhase === 'iosPrompt'
      ? 'iPhoneのWi-Fi接続確認で「接続」を選んでください。'
      : stage === 'connection' && connectionPhase === 'softAp' ? '更新用Wi-Fiの起動を待っています'
        : stage === 'connection' ? '本体との接続を確認しています'
          : transferComplete ? requiresManualBleConnection
            ? '転送を完了しています' : '本体の起動を確認しています'
            : 'インストールしています';

  useEffect(() => {
    const opening = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!opening) return;
    dismissedRef.current = false;
    setIntroComplete(false);
    setIntroConsents(emptyIntroConsents());
    setHideNextTime(defaultHideNextTime);
    setPasswordCopyMessage('');
    downloadAttemptedRef.current = false;
  }, [defaultHideNextTime, isOpen]);

  useEffect(() => {
    if (!isOpen || !introComplete || selectedFirmwareReady || !canDownloadFirmware ||
        firmwareDownloadBusy || downloadAttemptedRef.current) return;
    downloadAttemptedRef.current = true;
    onCacheFirmware();
  }, [canDownloadFirmware, firmwareDownloadBusy, introComplete, isOpen, onCacheFirmware, selectedFirmwareReady]);

  const close = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onHideNextTimeChange(hideNextTime);
    onDismiss();
  };

  return (
    <IonModal isOpen={isOpen} canDismiss backdropDismiss={!busy} aria-label="アプリ連携の準備"
      onDidDismiss={close} className="initial-firmware-setup-modal">
      <div className="initial-firmware-setup-surface">
        <IonHeader>
          <IonToolbar>
            <IonTitle>初回セットアップ</IonTitle>
            <ControlIconButton slot="end" aria-label="初回セットアップを閉じる" onClick={close}>
              <X className="ulsa-icon" size={20} strokeWidth={1.9} aria-hidden="true" />
            </ControlIconButton>
          </IonToolbar>
        </IonHeader>

        <div className="initial-firmware-setup-content">
          <div className="initial-setup-shell">
            <SetupProgress stage={stage} />
            <section className="initial-setup-stage" aria-live="polite">
              <ProductVisual key={stage} stage={stage} showPendingCue={stage === 'button'} pendingLedColor="green" />

              {stage === 'intro' && <>
                <h2>アプリ接続にはファームウェア更新が必要です</h2>
                <p className="initial-setup-intro-copy">
                  <span>開梱時、ULSA EVOには、基本機能のみが実装された「工場出荷ファーム」がインストールされています。</span>
                  <span>アプリ連携によるワイヤレス接続やログ機能を利用するには、「デモファームウェア」のインストールが必要です。以下の項目をご確認のうえ、インストールへお進みください。</span>
                </p>
                <div className="initial-setup-consent-list" role="group" aria-label="デモファームウェア利用条件">
                  {INTRO_CONSENTS.map(({ id, title, detail }) => (
                    <label key={id} className="initial-setup-consent-item">
                      <input type="checkbox" checked={introConsents[id]}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setIntroConsents((current) => ({ ...current, [id]: checked }));
                        }} />
                      <span><strong>{title}</strong><small>{detail}</small></span>
                    </label>
                  ))}
                </div></>}

              {stage === 'download' && <><p className="initial-setup-eyebrow">ステップ1</p>
                <h2>更新データを準備しています</h2>
                <p>{!initialSetupSupported ? 'この端末では更新できません。iPhoneアプリか対応するパソコンのブラウザを使用してください。'
                  : selectedRelease ? '準備が終わるまでお待ちください。' : '更新情報を確認しています。'}</p></>}

              {stage === 'button' && <><p className="initial-setup-eyebrow">ステップ2</p>
                <h2>本体ボタンを押し続けてください</h2>
                <p>緑点滅から白く点灯するまで約3秒押し、白点灯を確認したらボタンを離して「白く点灯したので次へ」を押してください。</p></>}

              {stage === 'connection' && <><p className="initial-setup-eyebrow">接続中</p>
                <h2>{userError ? '更新用Wi-Fiを確認できません' : autoJoinAvailable ? '本体に接続しています' : '更新用Wi-Fiへ接続'}</h2>
                <p>{userError
                  ? `本体が白点灯なら、${autoJoinAvailable ? 'iPhone' : '端末'}のWi-Fi設定で ${INITIAL_DEMO_SOFT_AP.ssid} に接続し、この画面で接続を再確認してください。`
                  : autoJoinAvailable
                  ? 'アプリが本体へ接続しています。'
                  : `端末のWi-Fi設定で ${INITIAL_DEMO_SOFT_AP.ssid} を選び、下のパスワードで接続してから、この画面に戻ってください。`}</p>
                {(!autoJoinAvailable || userError) && <div className="initial-setup-wifi-credentials">
                  <span>Wi-Fiパスワード</span>
                  <IonicControlButton controlSize="M44" fill="outline" className="initial-setup-copy-password"
                    aria-label="Wi-Fiパスワードをコピー" onClick={() => { void copyWifiPassword(); }}>
                    <span className="initial-setup-copy-content">
                      <span>{INITIAL_DEMO_SOFT_AP.password}</span><Copy className="ulsa-icon" size={18} aria-hidden="true" />
                    </span>
                  </IonicControlButton>
                  {passwordCopyMessage && <small role="status">{passwordCopyMessage}</small>}
                </div>}</>}

              {stage === 'transfer' && <><p className="initial-setup-eyebrow">ステップ3</p>
                <h2>{transferComplete ? requiresManualBleConnection
                  ? '転送を完了しています' : '本体の起動を確認しています'
                  : transferBusy ? 'インストール中' : 'デモファームウェアをインストール'}</h2>
                <p>{transferBusy || transferComplete ? '本体の電源を切らずにお待ちください。'
                  : '「インストール」を押してください。更新中は本体の電源を切らないでください。'}</p>
                {transferBusy && !transferComplete && <div className="initial-setup-transfer-row">
                  <div className="initial-setup-transfer-progress" role="progressbar"
                    aria-label="デモファームウェア転送の進捗" aria-valuemin={0} aria-valuemax={100}
                    aria-valuenow={uploadProgress?.percent ?? 0} aria-valuetext={`${uploadProgress?.percent ?? 0}%`}>
                    <span style={{ width: `${uploadProgress?.percent ?? 0}%` }} />
                  </div>
                  <strong>{uploadProgress?.percent ?? 0}%</strong>
                </div>}</>}

              {stage === 'verification' && <>
                <p className="initial-setup-eyebrow">{requiresManualBleConnection ? '次の操作' : '起動確認'}</p>
                <h2>{requiresManualBleConnection ? '本体へ接続してください' : 'アプリ連携を確認'}</h2>
                <p>{requiresManualBleConnection
                  ? '更新データの転送は完了しました。Web版では自動接続されません。本体の再起動後、このダイアログを閉じて画面上部の「BLEデバイス」を押し、ULSA EVOへ接続してください。'
                  : 'インストールは完了しました。本体への接続を確認します。'}</p>
              </>}

              {stage === 'complete' && <><p className="initial-setup-eyebrow">完了</p>
                <h2>セットアップ完了</h2><p>アプリ連携による計測を開始できます。</p></>}

              {userError && stage !== 'intro' && <p className="initial-setup-message" role="alert"
                aria-live="assertive">{userError}</p>}
            </section>

          </div>
        </div>

        <footer className="initial-setup-footer">
          <div className="initial-setup-actions">
              {busy && stage !== 'intro' && <p className="initial-setup-busy-status" role="status">
                {measuredPercent !== undefined || estimatedDurationMs !== undefined
                  ? <InitialProgressRing key={`${stage}:${connectionPhase}:${transferComplete}`}
                    durationMs={estimatedDurationMs} measuredPercent={measuredPercent} />
                  : <IonSpinner name="crescent" aria-hidden="true" />}
                <span>{busyText}</span>
              </p>}
              {stage === 'intro' && <IonicControlButton controlSize="M44" controlVariant="primary" tone="accent"
                expand="block" onClick={() => {
                  onHideNextTimeChange(hideNextTime);
                  setIntroComplete(true);
                }} disabled={!introConsentAccepted}>
                インストールを始める
              </IonicControlButton>}
              {stage === 'download' && userError && !busy &&
                <IonicControlButton controlSize="M44" controlVariant="primary" tone="accent"
                  expand="block" onClick={() => {
                    downloadAttemptedRef.current = true;
                    onCacheFirmware();
                  }} disabled={!canDownloadFirmware}>
                  <CloudDownload className="ulsa-icon" size={18} aria-hidden="true" />もう一度試す
                </IonicControlButton>}
              {stage === 'button' && !connectionFlowBusy && <IonicControlButton controlSize="M44"
                controlVariant="primary" tone="accent" expand="block" onClick={onStartUpdateNetwork} disabled={!canStartUpdateNetwork}>
                白く点灯したので次へ
              </IonicControlButton>}
              {stage === 'connection' && userError && !busy &&
                <IonicControlButton controlSize="M44" controlVariant="primary" tone="accent"
                  expand="block" onClick={onRetryInitialConnection} disabled={!canStartUpdateNetwork}>
                  接続を再確認
                </IonicControlButton>}
              {stage === 'transfer' && !transferBusy && <IonicControlButton controlSize="M44" controlVariant="primary"
                tone="accent" expand="block" onClick={onUpload} disabled={!canUpload}>インストール</IonicControlButton>}
              {stage === 'verification' && !transferBusy && <IonicControlButton controlSize="M44" controlVariant="primary"
                tone="accent" expand="block" onClick={requiresManualBleConnection ? close : onRetryVerification}>
                {requiresManualBleConnection ? 'ダイアログを閉じる' : '本体との接続を再確認'}
              </IonicControlButton>}
              {stage === 'complete' && <IonicControlButton controlSize="M44" controlVariant="primary" tone="accent"
                expand="block" onClick={close}>計測をはじめる</IonicControlButton>}
          </div>

          <label className="initial-setup-hide-checkbox">
            <input type="checkbox" checked={hideNextTime}
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setHideNextTime(checked);
                onHideNextTimeChange(checked);
              }} />
            <span>次回から表示しない</span>
          </label>
        </footer>
      </div>
    </IonModal>
  );
};
