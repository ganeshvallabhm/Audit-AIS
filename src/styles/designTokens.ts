/**
 * Executive Precision Design System Tokens
 * Extracted directly from Stitch reference specifications (DESIGN.md & screen exports).
 */
export const EXECUTIVE_PRECISION_TOKENS = {
  name: 'Executive Precision',
  colors: {
    surface: '#f8f9ff',
    surfaceDim: '#cbdbf5',
    surfaceLowest: '#ffffff',
    surfaceLow: '#eff4ff',
    surfaceContainer: '#e5eeff',
    surfaceHigh: '#dce9ff',
    surfaceHighest: '#d3e4fe',
    onSurface: '#0b1c30',
    onSurfaceVariant: '#44474d',
    outline: '#696c74',
    outlineVariant: '#c4c6ce',
    borderHairline: '#d9e2f0',
    primary: '#000615',
    primaryContainer: '#0b1f3a',
    secondary: '#0051d5',
    secondaryContainer: '#316bf3',
    secondaryFixed: '#dbe1ff',
    onSecondaryFixed: '#00174b',
    error: '#ba1a1a',
    errorContainer: '#ffdad6',
    onErrorContainer: '#93000a',
    success: '#16a34a',
    warning: '#f59e0b',
  },
  radii: {
    badge: '6px',
    control: '8px',
    card: '12px',
    modal: '12px',
    pill: '9999px',
  },
  shadows: {
    level1: '0 1px 3px 0 rgba(11, 31, 58, 0.04), 0 1px 2px -1px rgba(11, 31, 58, 0.02)',
    level2: '0 4px 6px -1px rgba(11, 31, 58, 0.08), 0 2px 4px -2px rgba(11, 31, 58, 0.04)',
    level3: '0 20px 25px -5px rgba(11, 31, 58, 0.12), 0 8px 10px -6px rgba(11, 31, 58, 0.06)',
  },
} as const;

export type BadgeTone =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'info'
  | 'warning'
  | 'danger'
  | 'success'
  | 'navy';

