import { Check, Plus, X } from 'lucide-react';
import type { DerivedMetricId } from './derivedMetricPreferences';
import { DERIVED_METRIC_OPTIONS } from './derivedMetricPreferences';
import { ControlIconButton, NativeControlButton } from '../controls';

interface DerivedMetricAddCardProps {
  isPickerOpen: boolean;
  onToggle: () => void;
}

export const DerivedMetricAddCard: React.FC<DerivedMetricAddCardProps> = ({ isPickerOpen, onToggle }) => (
  <NativeControlButton
    controlSize="S80"
    className="derived-metric-add-card"
    aria-label="参考指標を追加"
    aria-expanded={isPickerOpen}
    onClick={onToggle}
  >
    <Plus aria-hidden="true" size={28} strokeWidth={1.8} />
    <span>参考指標を追加</span>
  </NativeControlButton>
);

interface DerivedMetricPickerProps {
  selectedMetricIds: readonly DerivedMetricId[];
  onAdd: (id: DerivedMetricId) => void;
  onClose: () => void;
}

export const DerivedMetricPicker: React.FC<DerivedMetricPickerProps> = ({
  selectedMetricIds,
  onAdd,
  onClose,
}) => (
  <section className="derived-metric-picker" aria-label="参考指標を選択">
    <div className="derived-metric-picker-heading">
      <div>
        <p>参考指標を追加</p>
        <span>実測値ではなく、アプリ内での計算結果です。</span>
      </div>
      <ControlIconButton className="derived-metric-picker-close" onClick={onClose} aria-label="指標の選択を閉じる">
        <X aria-hidden="true" size={18} strokeWidth={2} />
      </ControlIconButton>
    </div>
    <div className="derived-metric-option-list">
      {DERIVED_METRIC_OPTIONS.map((option) => {
        const isSelected = selectedMetricIds.includes(option.id);
        return (
          <NativeControlButton
            key={option.id}
            controlSize="R56"
            selectionState={isSelected ? 'on' : 'off'}
            tone="accent"
            className="derived-metric-option"
            data-state={isSelected ? 'selected' : 'available'}
            aria-disabled={isSelected}
            aria-label={`${option.label}、${isSelected ? '表示中' : '追加'}`}
            onClick={() => {
              if (!isSelected) onAdd(option.id);
            }}
          >
            <span className="derived-metric-option-copy">
              <strong>{option.label}</strong>
              <small>{option.description}</small>
            </span>
            {isSelected
              ? <Check aria-hidden="true" size={18} strokeWidth={2} />
              : <Plus aria-hidden="true" size={18} strokeWidth={2} />}
          </NativeControlButton>
        );
      })}
    </div>
  </section>
);
