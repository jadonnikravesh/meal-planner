// ─── Unified app palette ──────────────────────────────────────────────────────
// All screens pull from one of these two objects via useTheme().
// Property names match what screens destructure from the theme.

export const DARK_COLORS = {
  // ── Base UI ────────────────────────────────────────────────────────────────
  bg:        '#0E0E14',
  card:      '#18182A',
  card2:     '#1E1E30',
  border:    '#23233A',

  // ── Text ──────────────────────────────────────────────────────────────────
  white:     '#FFFFFF',    // primary text / icon on dark bg
  muted:     '#7878A0',    // secondary text

  // ── Accent (purple) ────────────────────────────────────────────────────────
  accent:    '#7C6FE0',
  accentDim: '#2E2A5C',

  // ── Input ─────────────────────────────────────────────────────────────────
  inputBg:   '#131325',

  // ── Macro / status colors ──────────────────────────────────────────────────
  fire:      '#FF6B00',
  protein:   '#E86B6B',
  carbs:     '#D4A557',
  fat:       '#4E8FD9',
  water:     '#4E9FD9',
  track:     '#272740',

  green:     '#4CAF50',
  greenDim:  '#0A2A0A',
  red:       '#E84B4B',
  redDim:    '#2E0A0A',

  // ── Tab bar ────────────────────────────────────────────────────────────────
  tabBar:      '#131320',
  tabBorder:   '#1E1E30',
  tabActive:   '#FFFFFF',
  tabInactive: '#55556E',
  statusBar:   'light',    // expo-status-bar style prop
};

export const LIGHT_COLORS = {
  // ── Base UI ────────────────────────────────────────────────────────────────
  bg:        '#F4F6FB',
  card:      '#FFFFFF',
  card2:     '#EEF2F8',
  border:    '#E2E8F0',

  // ── Text ──────────────────────────────────────────────────────────────────
  white:     '#0F172A',    // primary text on light bg (dark)
  muted:     '#6B7280',

  // ── Accent (purple, slightly deeper for light contrast) ────────────────────
  accent:    '#6B5FD0',
  accentDim: 'rgba(107,95,208,0.12)',

  // ── Input ─────────────────────────────────────────────────────────────────
  inputBg:   '#EEF2F8',

  // ── Macro / status colors ──────────────────────────────────────────────────
  fire:      '#EA6E04',
  protein:   '#C84040',
  carbs:     '#9A6B28',
  fat:       '#2563EB',
  water:     '#2563EB',
  track:     '#DDE4EF',

  green:     '#16A34A',
  greenDim:  '#DCFCE7',
  red:       '#DC2626',
  redDim:    '#FEE2E2',

  // ── Tab bar ────────────────────────────────────────────────────────────────
  tabBar:      '#FFFFFF',
  tabBorder:   '#E2E8F0',
  tabActive:   '#6B5FD0',
  tabInactive: '#9CA3AF',
  statusBar:   'dark',
};

// Legacy export — kept so any file that imports COLORS still compiles
export const COLORS = DARK_COLORS;

export const RADIUS = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 9999,
};

export const SPACING = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32,
};
