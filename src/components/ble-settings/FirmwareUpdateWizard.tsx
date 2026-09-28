import { IonModal, IonSpinner } from '@ionic/react';
import { Check, CircleAlert, Copy, X } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NativeControlButton } from '../controls';
import { FirmwareUpdateProduct, type FirmwareProductStage } from './FirmwareUpdateProduct';
import type { OtaConnectionPhase } from './otaPanelHelpers';
import type { Esp32OtaSession } from '../../services/ota/esp32OtaTransfer';
import './styles/firmware-update-wizard.css';

export type FirmwareWizardStage = 'download' | 'button' | 'connection' | 'manualWifi' | 'checking' | 'ready' | 'updating' | 'complete' | 'canceled' | 'error';
export type FirmwareWizardAction = { label: string; run: () => void; disabled?: boolean };

const ESTIMATED_DURATION_MS = {
  download: 20_000,
  credentials: 10_000,
  softAp: 8_000,
  wifi: 18_000,
  checking: 15_000,
  updating: 30_000,
} as const;

const estimateDurationMs = (
  stage: FirmwareWizardStage,
  connectionPhase: OtaConnectionPhase | undefined,
  autoJoinAvailable: boolean,
): number | null => {
  if (stage === 'download') return ESTIMATED_DURATION_MS.download;
  if (stage === 'button' && connectionPhase === 'credentials') return ESTIMATED_DURATION_MS.credentials;
  if (stage === 'connection' && connectionPhase === 'softAp') return ESTIMATED_DURATION_MS.softAp;
  if (stage === 'connection' && connectionPhase === 'wifi' && autoJoinAvailable) return ESTIMATED_DURATION_MS.wifi;
  if (stage === 'checking') return ESTIMATED_DURATION_MS.checking;
  if (stage === 'updating') return ESTIMATED_DURATION_MS.updating;
  return null;
};

const FirmwareProgressRing = ({ percent, kind }: { percent: number; kind: 'measured' | 'estimated' }) => (
  <span
    className="firmware-update-progress-ring"
    data-testid="firmware-update-progress-ring"
    data-progress-kind={kind}
    aria-hidden="true"
    style={{ '--firmware-progress': `${percent}%` } as CSSProperties}
  />
);

const EstimatedProgressRing = ({ durationMs, remainingSeconds }: {
  durationMs: number;
  remainingSeconds?: number | null;
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const hasCountdown = typeof remainingSeconds === 'number' && Number.isFinite(remainingSeconds);
  useEffect(() => {
    if (hasCountdown) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => window.clearInterval(timer);
  }, [hasCountdown]);
  const elapsed = hasCountdown
    ? durationMs - (remainingSeconds ?? 0) * 1000
    : elapsedMs;
  // An estimate must never imply completion while the operation is still busy.
  const percent = Math.min(95, Math.max(0, Math.floor(elapsed / durationMs * 100)));
  return <FirmwareProgressRing percent={percent} kind="estimated" />;
};

const COPY: Record<FirmwareWizardStage, { title: string; description: string; step: number; visual: FirmwareProductStage }> = {
  download: { title: '更新データを準備しています', description: 'ダウンロードが終わるまでお待ちください。', step: 1, visual: 'download' },
  button: { title: '本体ボタンを押し続けてください', description: '約3秒押し続け、LEDが白く点灯したら離してください。', step: 2, visual: 'button' },
  connection: { title: '本体に接続しています', description: '更新用Wi-Fiへの接続を確認しています。', step: 2, visual: 'connection' },
  manualWifi: { title: '更新用Wi-Fiに接続', description: '端末のWi-Fi設定で下のネットワークへ接続し、この画面に戻ってください。', step: 2, visual: 'connection' },
  checking: { title: '更新の準備をしています', description: '準備が終わるまでお待ちください。', step: 3, visual: 'transfer' },
  ready: { title: '更新の準備ができました', description: '「更新を開始」を押してください。更新中は本体の電源を切らないでください。', step: 3, visual: 'transfer' },
  updating: { title: '更新しています', description: '本体の電源を切らず、この画面を開いたままお待ちください。', step: 3, visual: 'transfer' },
  complete: { title: '更新が完了しました', description: '計測が再開しない場合は、アプリから本体へ再接続してください。', step: 3, visual: 'complete' },
  canceled: { title: '更新を中止しました', description: '必要な場合は、本体へ再接続してください。', step: 1, visual: 'intro' },
  error: { title: '更新を続けられません', description: '下のメッセージを確認してください。', step: 3, visual: 'connection' },
};

const FirmwareWifiCredentials = ({ session }: { session: Esp32OtaSession }) => {
  const [copyMessage, setCopyMessage] = useState('');
  const copyMessageRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (copyMessage) copyMessageRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [copyMessage]);
  const copyPassword = async () => {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(session.password);
      setCopyMessage('パスワードをコピーしました');
    } catch {
      setCopyMessage('コピーできませんでした。パスワードを手入力してください。');
    }
  };
  return <dl className="firmware-update-wifi">
    <div><dt>ネットワーク名</dt><dd>{session.ssid}</dd></div>
    <div><dt>パスワード</dt><dd>{session.password ? <>
      <NativeControlButton controlSize="M44" className="firmware-update-copy-password"
        aria-label="Wi-Fiパスワードをコピー" onClick={() => { void copyPassword(); }}>
        <span>{session.password}</span><Copy size={18} aria-hidden="true" />
      </NativeControlButton>
      {copyMessage && <small ref={copyMessageRef} className="firmware-update-copy-message" role="status">{copyMessage}</small>}
    </> : 'なし'}</dd></div>
  </dl>;
};

export const FirmwareUpdateWizard = ({
  isOpen, target, version, stage, busy, primaryAction, secondaryAction, onDismiss,
  progress, progressLabel, error, description, manualSession, details, buttonReady = true,
  connectionInstruction, connectionPhase, connectionRemainingSeconds, autoJoinAvailable = false,
}: {
  isOpen: boolean;
  target: 'ESP32' | 'STM32';
  version?: string;
  stage: FirmwareWizardStage;
  busy: boolean;
  primaryAction: FirmwareWizardAction | null;
  secondaryAction?: FirmwareWizardAction | null;
  onDismiss: () => void;
  progress?: number | null;
  progressLabel?: string;
  error?: string | null;
  description?: string;
  connectionInstruction?: string;
  connectionPhase?: OtaConnectionPhase;
  connectionRemainingSeconds?: number | null;
  autoJoinAvailable?: boolean;
  manualSession?: Esp32OtaSession | null;
  details?: ReactNode;
  buttonReady?: boolean;
}) => {
  // Show the physical instruction from the outset, but never invite a hold
  // before the firmware has acknowledged its physical-authorization window.
  const copy = stage === 'button' && !buttonReady ? {
    ...COPY.button,
    title: busy ? '本体操作の準備中です' : '本体操作を開始してください',
    description: busy
      ? '本体ボタンはまだ押さずにお待ちください。'
      : '画面の案内が出てから本体ボタンを押してください。',
  } : COPY[stage];
  const contentRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);
  useEffect(() => { contentRef.current?.scrollTo?.({ top: 0 }); }, [stage]);
  useEffect(() => { if (isOpen) dismissedRef.current = false; }, [isOpen]);
  const percent = typeof progress === 'number' && Number.isFinite(progress)
    ? Math.min(100, Math.max(0, progress)) : null;
  const estimatedDuration = busy
    ? estimateDurationMs(stage, connectionPhase, autoJoinAvailable)
    : null;
  const hasMeasuredProgress = busy && (stage === 'updating' || stage === 'checking') && percent !== null;
  // Closing the dialog is presentation-only.  Hiding the progress UI must not
  // turn an active transfer or write into an implicit cancel, so the close
  // control remains available in every stage.
  const close = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  return (
    <IonModal isOpen={isOpen} canDismiss backdropDismiss={false} onDidDismiss={close}
      className="firmware-update-modal" aria-label={`${target}ファームウェア更新`}>
      <div className="firmware-update-surface" data-stage={stage}>
        <header className="firmware-update-header">
          <div><p>ファームウェア更新</p><h1>{target}</h1></div>
          <NativeControlButton controlSize="I44" className="firmware-update-close"
            aria-label="更新画面を閉じる" onClick={close}>
            <X size={20} aria-hidden="true" />
          </NativeControlButton>
        </header>
        <div className="firmware-update-content" ref={contentRef}>
          <ol className="firmware-update-steps" aria-label="ファームウェア更新の進捗">
            {['準備', '本体操作', '更新'].map((label, index) => {
              const complete = stage === 'complete' || index + 1 < copy.step;
              const current = stage !== 'complete' && index + 1 === copy.step;
              return <li key={label} className={complete ? 'complete' : current ? 'current' : ''}
                aria-current={current ? 'step' : undefined}>
                <span>{complete ? <Check size={16} aria-hidden="true" /> : index + 1}</span><small>{label}</small>
              </li>;
            })}
          </ol>
          <section className="firmware-update-stage" aria-live="polite">
            <FirmwareUpdateProduct stage={copy.visual} showPendingCue={stage === 'button' && buttonReady}
              showButtonCue={stage !== 'button' || buttonReady} />
            {version && <p className="firmware-update-version">{version}</p>}
            <h2>{copy.title}</h2>
            <p className="firmware-update-description">{description ?? copy.description}</p>
            {error && <p className="firmware-update-error" role="alert" aria-live="assertive">
              <CircleAlert size={20} aria-hidden="true" /><span>{error}</span>
            </p>}
            {manualSession && (stage === 'manualWifi' || (stage === 'error' && !autoJoinAvailable)) && (
              <FirmwareWifiCredentials key={`${manualSession.ssid}:${manualSession.token}:${manualSession.password}`}
                session={manualSession} />
            )}
            {stage === 'updating' && percent !== null && <div className="firmware-update-progress">
              <div role="progressbar" aria-label={progressLabel ?? `${target}更新の進捗`}
                aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${percent}%`}>
                <span style={{ width: `${percent}%` }} />
              </div><strong>{percent}%</strong>
            </div>}
          </section>
          {details && <div className="firmware-update-details">{details}</div>}
        </div>
        <footer className="firmware-update-footer">
          {busy ? <p role="status">{hasMeasuredProgress ? (
              <FirmwareProgressRing percent={percent} kind="measured" />
            ) : estimatedDuration !== null ? (
              <EstimatedProgressRing
                key={`${stage}:${connectionPhase ?? ''}`}
                durationMs={estimatedDuration}
                remainingSeconds={stage === 'connection' && connectionPhase === 'wifi'
                  ? connectionRemainingSeconds : null}
              />
            ) : <IonSpinner name="crescent" aria-hidden="true" />}
            {connectionInstruction ?? (stage === 'button' && buttonReady ? '本体のボタン操作を待っています' : stage === 'updating' ? '更新が終わるまでお待ちください' : '準備を進めています')}
          </p> : primaryAction && <NativeControlButton controlSize="M44" controlVariant="primary"
            className="firmware-update-primary" onClick={primaryAction.run} disabled={primaryAction.disabled}>
            {primaryAction.label}
          </NativeControlButton>}
          {!busy && secondaryAction && <NativeControlButton controlSize="M44" className="firmware-update-secondary"
            onClick={secondaryAction.run} disabled={secondaryAction.disabled}>{secondaryAction.label}</NativeControlButton>}
        </footer>
      </div>
    </IonModal>
  );
};
