/**
 * ダッシュボードのテーマ定義
 */
export interface Theme {
  name: string;
  gradient: string;
  description: string;
  isLight?: boolean; // ライトテーマかどうか
  accentColor: string; // アクセントカラー（単位ボタンなどに使用）
  gaugeColors: {
    windSpeed: { color: string; gradient: [string, string] };
    windDirection: string; // 風向ドットの色
    temperature: { color: string; gradient: [string, string] };
    soundSpeed: { color: string; gradient: [string, string] };
  };
}

export const themes: Theme[] = [
  { 
    name: '紫系', 
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
    description: 'モダン・プレミアム',
    accentColor: '#667eea',
    gaugeColors: {
      windSpeed: { color: '#A78BFA', gradient: ['#A78BFA', '#8B5CF6'] },
      windDirection: '#FCD34D',
      temperature: { color: '#FB7185', gradient: ['#FB7185', '#F43F5E'] },
      soundSpeed: { color: '#34D399', gradient: ['#34D399', '#10B981'] }
    }
  },
  { 
    name: '青系', 
    gradient: 'linear-gradient(135deg, #0066cc 0%, #0099ff 100%)', 
    description: 'テック・クール',
    accentColor: '#0066cc',
    gaugeColors: {
      windSpeed: { color: '#60A5FA', gradient: ['#60A5FA', '#3B82F6'] },
      windDirection: '#FBBF24',
      temperature: { color: '#F87171', gradient: ['#F87171', '#EF4444'] },
      soundSpeed: { color: '#4ADE80', gradient: ['#4ADE80', '#22C55E'] }
    }
  },
  { 
    name: 'グリーン系', 
    gradient: 'linear-gradient(135deg, #34c759 0%, #00d084 100%)', 
    description: 'ヘルスケア',
    accentColor: '#34c759',
    gaugeColors: {
      windSpeed: { color: '#6EE7B7', gradient: ['#6EE7B7', '#34D399'] },
      windDirection: '#FDE047',
      temperature: { color: '#FCA5A5', gradient: ['#FCA5A5', '#F87171'] },
      soundSpeed: { color: '#86EFAC', gradient: ['#86EFAC', '#4ADE80'] }
    }
  },
  { 
    name: 'ULSA Graphite',
    gradient: 'radial-gradient(circle at 18% 0%, rgba(49, 196, 181, 0.16) 0%, rgba(49, 196, 181, 0) 34%), linear-gradient(150deg, #071019 0%, #0b1721 48%, #101d29 100%)',
    description: '暗所向け・高コントラスト',
    accentColor: '#5EEAD4',
    gaugeColors: {
      windSpeed: { color: '#67E8F9', gradient: ['#67E8F9', '#22C5D8'] },
      windDirection: '#F6C76A',
      temperature: { color: '#FB8A7A', gradient: ['#FB9B8E', '#F36F62'] },
      soundSpeed: { color: '#78D8A0', gradient: ['#8CE4AD', '#4FC482'] }
    }
  },
  { 
    name: 'ULSA Slate',
    gradient: 'radial-gradient(circle at 16% 0%, rgba(133, 238, 224, 0.22) 0%, rgba(133, 238, 224, 0) 34%), linear-gradient(150deg, #314956 0%, #405f6b 52%, #527580 100%)',
    description: '標準・明るめの計測画面',
    accentColor: '#6DE7D6',
    gaugeColors: {
      windSpeed: { color: '#78E9F6', gradient: ['#78E9F6', '#35C8D8'] },
      windDirection: '#F4CA74',
      temperature: { color: '#FF9B8E', gradient: ['#FFAEA4', '#F07E70'] },
      soundSpeed: { color: '#8AE0AB', gradient: ['#9CE8B8', '#61C88C'] }
    }
  },
  { 
    name: 'オレンジ系', 
    gradient: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)', 
    description: 'エネルギー',
    accentColor: '#ff6b35',
    gaugeColors: {
      windSpeed: { color: '#FDBA74', gradient: ['#FDBA74', '#FB923C'] },
      windDirection: '#FEF08A',
      temperature: { color: '#FCA5A5', gradient: ['#FCA5A5', '#F87171'] },
      soundSpeed: { color: '#86EFAC', gradient: ['#86EFAC', '#4ADE80'] }
    }
  },
  { 
    name: 'サイバー', 
    gradient: 'linear-gradient(135deg, #00d4ff 0%, #a855f7 100%)', 
    description: 'サイバーパンク',
    accentColor: '#00d4ff',
    gaugeColors: {
      windSpeed: { color: '#22D3EE', gradient: ['#22D3EE', '#06B6D4'] },
      windDirection: '#FDE047',
      temperature: { color: '#F472B6', gradient: ['#F472B6', '#EC4899'] },
      soundSpeed: { color: '#A78BFA', gradient: ['#A78BFA', '#8B5CF6'] }
    }
  },
  { 
    name: 'ULSA Light',
    gradient: 'radial-gradient(circle at 16% 0%, rgba(76, 181, 170, 0.14) 0%, rgba(76, 181, 170, 0) 36%), linear-gradient(150deg, #f4f8f8 0%, #e4edef 54%, #cedee2 100%)',
    description: '明所向け・ライト',
    isLight: true,
    accentColor: '#495057',
    gaugeColors: {
      windSpeed: { color: '#3B82F6', gradient: ['#60A5FA', '#3B82F6'] },
      windDirection: '#F59E0B',
      temperature: { color: '#EF4444', gradient: ['#F87171', '#EF4444'] },
      soundSpeed: { color: '#10B981', gradient: ['#34D399', '#10B981'] }
    }
  }
];

export const ULSA_THEME_OPTIONS = [4, 3, 7] as const;
export const DEFAULT_ULSA_THEME_INDEX = 7;
export const ULSA_THEME_IDS = ['slate', 'graphite', 'light'] as const;
export type UlsaThemeId = (typeof ULSA_THEME_IDS)[number];
export const DEFAULT_ULSA_THEME_ID: UlsaThemeId = 'light';
export const ULSA_THEME_STORAGE_KEY = 'ulsa-evo-theme';
export const LEGACY_ULSA_THEME_STORAGE_KEY = 'ulsa-evo-theme-index';

export const ULSA_THEME_INDEX_BY_ID: Record<UlsaThemeId, (typeof ULSA_THEME_OPTIONS)[number]> = {
  slate: 4,
  graphite: 3,
  light: 7,
};

export const ULSA_THEMES: Record<UlsaThemeId, Theme> = {
  slate: themes[ULSA_THEME_INDEX_BY_ID.slate],
  graphite: themes[ULSA_THEME_INDEX_BY_ID.graphite],
  light: themes[ULSA_THEME_INDEX_BY_ID.light],
};

export const isUlsaThemeIndex = (value: number): value is (typeof ULSA_THEME_OPTIONS)[number] =>
  ULSA_THEME_OPTIONS.includes(value as (typeof ULSA_THEME_OPTIONS)[number]);

export const isUlsaThemeId = (value: string | null): value is UlsaThemeId =>
  value !== null && ULSA_THEME_IDS.includes(value as UlsaThemeId);

export const getUlsaThemeIndex = (themeId: UlsaThemeId) => ULSA_THEME_INDEX_BY_ID[themeId];

export const getUlsaThemeIdFromIndex = (themeIndex: number): UlsaThemeId | null => {
  const entry = Object.entries(ULSA_THEME_INDEX_BY_ID).find(([, index]) => index === themeIndex);
  return entry ? entry[0] as UlsaThemeId : null;
};

type ThemePreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const readUlsaThemePreference = (storage?: ThemePreferenceStorage): UlsaThemeId => {
  if (!storage) return DEFAULT_ULSA_THEME_ID;
  try {
    const storedId = storage.getItem(ULSA_THEME_STORAGE_KEY);
    if (isUlsaThemeId(storedId)) return storedId;
    const legacyIndex = Number(storage.getItem(LEGACY_ULSA_THEME_STORAGE_KEY));
    return getUlsaThemeIdFromIndex(legacyIndex) ?? DEFAULT_ULSA_THEME_ID;
  } catch {
    return DEFAULT_ULSA_THEME_ID;
  }
};

export const persistUlsaThemePreference = (
  storage: ThemePreferenceStorage,
  themeId: UlsaThemeId,
) => {
  storage.setItem(ULSA_THEME_STORAGE_KEY, themeId);
  storage.removeItem(LEGACY_ULSA_THEME_STORAGE_KEY);
};
