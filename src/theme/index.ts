/**
 * Design tokens. Every colour, spacing and font size in the UI comes from here so
 * the look can be changed in one place.
 */
import type { PhaseType } from '../domain/types';

export const colors = {
  background: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F4',
  border: '#E2E6EA',
  text: '#131A22',
  textSecondary: '#5B6774',
  textMuted: '#8A95A1',
  primary: '#0E7C6B',
  primarySoft: '#DCF2EE',
  primaryText: '#0A5F52',
  accent: '#D97706',
  accentSoft: '#FEF3C7',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',
  chartLine: '#0E7C6B',
  chartLineSoft: '#9ED3C9',
  chartGrid: '#E6EAEE',
  onPrimary: '#FFFFFF',
};

export const phaseColors: Record<PhaseType, { fill: string; soft: string; label: string }> = {
  baseline: { fill: '#94A3B8', soft: '#E9EDF2', label: 'Baseline' },
  run_in: { fill: '#8B5CF6', soft: '#EDE9FE', label: 'Run-in' },
  intervention: { fill: colors.primary, soft: colors.primarySoft, label: 'Intervention' },
  washout: { fill: colors.accent, soft: colors.accentSoft, label: 'Washout' },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.4, textTransform: 'uppercase' as const },
  stat: { fontSize: 24, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.3 },
};

/** Width of the phone-sized frame used for the browser preview. */
export const PHONE_WIDTH = 400;

export const shadow = {
  card: {
    shadowColor: '#0B1620',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
};
