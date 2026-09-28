import { LED_WIND_REACTIVE_THEMES } from '../../services/ble/ledWindReactive';
import { useRovingRadioGroup } from '../../hooks/useRovingRadioGroup';
import type { LEDWindReactiveTheme } from '../../types/ble';
import { NativeControlButton } from '../controls';

type LedWindReactiveThemeSelectorProps = {
  value: LEDWindReactiveTheme;
  disabled: boolean;
  onChange: (theme: LEDWindReactiveTheme) => void;
};

const LED_WIND_REACTIVE_THEME_IDS = LED_WIND_REACTIVE_THEMES.map((theme) => theme.id);

export const LedWindReactiveThemeSelector = ({
  value,
  disabled,
  onChange,
}: LedWindReactiveThemeSelectorProps) => {
  const getThemeRadioProps = useRovingRadioGroup({
    values: LED_WIND_REACTIVE_THEME_IDS,
    value,
    onChange,
    disabled,
  });

  return (
    <div className="led-wind-reactive-theme-selector" role="radiogroup" aria-label="風速連動LEDカラーテーマ">
      {LED_WIND_REACTIVE_THEMES.map((theme) => {
        const selected = theme.id === value;
        return (
          <NativeControlButton
            key={theme.id}
            controlSize="R56"
            selectionState={selected ? 'on' : 'off'}
            tone="accent"
            className={`led-wind-reactive-theme-option${selected ? ' selected' : ''}`}
            role="radio"
            aria-checked={selected}
            title={`${theme.label}: 低風速から高風速の色変化`}
            disabled={disabled}
            onClick={() => onChange(theme.id)}
            {...getThemeRadioProps(theme.id)}
          >
            <span
              className="led-wind-reactive-theme-preview"
              aria-hidden="true"
              style={{ background: `linear-gradient(135deg, ${theme.colors.join(', ')})` }}
            />
            <span>{theme.label}</span>
          </NativeControlButton>
        );
      })}
    </div>
  );
};
