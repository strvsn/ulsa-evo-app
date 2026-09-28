import { CheckCircle2, Palette } from 'lucide-react';
import { themes, ULSA_THEME_OPTIONS } from '../../constants/themes';
import { useRovingRadioGroup } from '../../hooks/useRovingRadioGroup';
import { SectionCard } from './primitives';
import { NativeControlButton } from '../controls';

type AppearancePanelProps = {
  currentThemeIndex: number;
  onThemeChange: (themeIndex: number) => void;
};

export const AppearancePanel = ({
  currentThemeIndex,
  onThemeChange,
}: AppearancePanelProps) => {
  const getThemeRadioProps = useRovingRadioGroup({
    values: ULSA_THEME_OPTIONS,
    value: currentThemeIndex,
    onChange: onThemeChange,
  });

  return (
    <SectionCard
      title="画面テーマ"
      icon={<Palette className="ulsa-icon" size={18} strokeWidth={1.8} aria-hidden="true" />}
    >
      <p className="appearance-theme-intro">
        周囲の明るさに合わせて選択できます。計測値・状態色・操作内容は変わりません。
      </p>
      <div className="appearance-theme-grid" role="radiogroup" aria-label="画面テーマ">
        {ULSA_THEME_OPTIONS.map((themeIndex) => {
          const theme = themes[themeIndex];
          const selected = currentThemeIndex === themeIndex;
          return (
            <NativeControlButton
              key={themeIndex}
              controlSize="R56"
              selectionState={selected ? 'on' : 'off'}
              tone="accent"
              className={`appearance-theme-option ${selected ? 'active' : ''}`}
              role="radio"
              aria-checked={selected}
              aria-label={`${theme.name} ${theme.description}`}
              onClick={() => onThemeChange(themeIndex)}
              {...getThemeRadioProps(themeIndex)}
            >
              <span className="appearance-theme-preview" style={{ background: theme.gradient }} aria-hidden="true">
                <span className="appearance-theme-preview-header" />
                <span className="appearance-theme-preview-card primary" />
                <span className="appearance-theme-preview-card secondary" />
              </span>
              <span className="appearance-theme-copy">
                <strong>{theme.name}</strong>
                <small>{theme.description}</small>
              </span>
              <CheckCircle2
                className="appearance-theme-check ulsa-icon"
                size={19}
                strokeWidth={1.9}
                aria-hidden="true"
              />
            </NativeControlButton>
          );
        })}
      </div>
    </SectionCard>
  );
};
