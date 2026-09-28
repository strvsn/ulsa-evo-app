import { memo } from 'react';
import { X } from 'lucide-react';
import { ControlIconButton } from './controls';

interface MetricCardProps {
  metricId?: string;
  label: string;
  value: number | null;
  unit: string;
  className: string;
  decimals?: number;
  note?: string;
  detail?: string;
  showPositiveSign?: boolean;
  onRemove?: () => void;
}

/**
 * センサー計測値を表示するカード
 * メモ化により、propsが変わった時のみ再レンダリング
 */
const MetricCard = memo<MetricCardProps>(({ metricId, label, value, unit, className, decimals = 1, note, detail, showPositiveSign = false, onRemove }) => (
  <div
    className={`metric-card metric-card-text metric-card-uniform-type ${onRemove ? 'metric-card-removable' : ''} ${className}`}
    data-metric-id={metricId}
  >
    {onRemove && (
      <ControlIconButton
        className="metric-card-remove"
        aria-label={`${label}を削除`}
        tone="danger"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <X className="ulsa-icon" aria-hidden="true" size={13} strokeWidth={2.4} />
      </ControlIconButton>
    )}
    <div className="metric-info">
      <div className="metric-label-row">
        <div className="metric-label">{label}</div>
        {note && <div className="metric-note">{note}</div>}
      </div>
      {detail && <div className="metric-detail">{detail}</div>}
      <div className="metric-value">
        <span className={value === null ? 'metric-number metric-empty' : 'metric-number'}>
          {value === null ? '--' : `${showPositiveSign && value > 0 ? '+' : ''}${value.toFixed(decimals)}`}
        </span>
        <span className="metric-unit" hidden={value === null}>{unit}</span>
      </div>
    </div>
  </div>
));

export default MetricCard;
