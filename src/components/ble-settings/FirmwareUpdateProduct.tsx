import { CheckCircle2, CloudDownload, CloudUpload, MousePointerClick, RadioTower, Wifi, type LucideIcon } from 'lucide-react';
import './styles/initial-firmware-setup-wizard.css';

export type FirmwareProductStage = 'intro' | 'download' | 'button' | 'connection' | 'transfer' | 'verification' | 'complete';

const STAGE_ICONS: Record<Exclude<FirmwareProductStage, 'intro'>, LucideIcon> = {
  download: CloudDownload,
  button: MousePointerClick,
  connection: Wifi,
  transfer: CloudUpload,
  verification: RadioTower,
  complete: CheckCircle2,
};

export const FirmwareUpdateProduct = ({
  stage,
  showPendingCue = false,
  pendingLedColor = 'yellow',
  showButtonCue = true,
}: {
  stage: FirmwareProductStage;
  showPendingCue?: boolean;
  pendingLedColor?: 'yellow' | 'green';
  showButtonCue?: boolean;
}) => {
  const StageIcon = stage === 'intro' ? null : STAGE_ICONS[stage];
  return (
    <div className={`initial-setup-product-visual stage-${stage}`}>
      <div className="initial-setup-product-frame">
        <img className="initial-setup-product-image" src="/ulsa-evo-product.png"
          width="920" height="1080" alt="ULSA EVO本体" decoding="async" />
        {StageIcon && <span className="initial-setup-stage-badge" aria-hidden="true"><StageIcon size={23} /></span>}
      </div>
      {stage === 'button' && showButtonCue && (
        <div
          className={`initial-setup-led-cue${showPendingCue ? ' initial-setup-led-cue--sequence' : ''}`}
          aria-label={showPendingCue
            ? `待機中はLEDが${pendingLedColor === 'green' ? '緑' : '黄色'}で点滅し、白に点灯したらボタンを離す`
            : 'LEDが白に点灯したらボタンを離す'}
        >
          {showPendingCue && <>
            <i className={`initial-setup-led-dot initial-setup-led-dot-pending${pendingLedColor === 'green' ? ' initial-setup-led-dot-pending--green' : ''}`} aria-hidden="true" />
            <span className="initial-setup-led-label">{pendingLedColor === 'green' ? '緑点滅' : '黄色点滅'}</span>
            <span className="initial-setup-led-arrow" aria-hidden="true">→</span>
          </>}
          <i className="initial-setup-led-dot initial-setup-led-dot-confirmed" aria-hidden="true" />
          <span className="initial-setup-led-label">白になったら離す</span>
        </div>
      )}
    </div>
  );
};
