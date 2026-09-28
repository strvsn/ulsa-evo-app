import { IonRange } from '@ionic/react';
import {
  LED_BRIGHTNESS_LEVELS,
  getLedBrightnessLevel,
} from '../../services/ble/ledBrightness';

type LedBrightnessLevelSelectorProps = {
  value: number;
  isUpsideDown: boolean;
  disabled: boolean;
  onChange: (brightness: number) => void;
};

export const LedBrightnessLevelSelector = ({
  value,
  isUpsideDown,
  disabled,
  onChange,
}: LedBrightnessLevelSelectorProps) => {
  const selectedLevel = getLedBrightnessLevel(value);
  const selectedLabel = selectedLevel === 0
    ? '消灯'
    : `レベル ${selectedLevel} / ${LED_BRIGHTNESS_LEVELS.length - 1}`;
  const handleInput = (levelValue: number | { lower: number; upper: number }) => {
    if (typeof levelValue !== 'number') {
      return;
    }

    const level = Math.max(
      0,
      Math.min(LED_BRIGHTNESS_LEVELS.length - 1, Math.round(levelValue))
    );
    onChange(LED_BRIGHTNESS_LEVELS[level]);
  };

  return (
    <div className="led-brightness-level-selector">
      <div className="led-brightness-level-readout" aria-live="polite">
        <span>設定値</span>
        <strong>{selectedLabel}</strong>
      </div>
      <div className="led-brightness-slider-shell">
        <IonRange
          className="led-brightness-slider"
          data-testid="led-brightness-slider"
          mode="ios"
          dir={isUpsideDown ? 'rtl' : 'ltr'}
          min={0}
          max={LED_BRIGHTNESS_LEVELS.length - 1}
          step={1}
          value={selectedLevel}
          snaps
          ticks
          aria-label="LED輝度"
          aria-valuetext={selectedLabel}
          disabled={disabled}
          onIonInput={(event) => handleInput(event.detail.value)}
        />
      </div>
      <div className="led-brightness-level-axis" aria-hidden="true">
        <span>消灯</span>
        <span>最大</span>
      </div>
    </div>
  );
};
