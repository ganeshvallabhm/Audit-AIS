import React from 'react';
import { BadgeTone } from '../../styles/designTokens';

interface StatusBadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  dotColor?: string;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-secondary-container text-on-secondary-container',
  secondary: 'bg-surface-container-highest text-secondary',
  neutral: 'bg-surface-container text-on-surface-variant',
  info: 'bg-secondary-fixed text-on-secondary-fixed',
  warning: 'bg-amber-50 text-amber-800 border border-amber-200',
  danger: 'bg-error-container text-on-error-container',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  navy: 'bg-primary-container text-on-primary',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  children,
  tone = 'neutral',
  dot = false,
  dotColor,
  className = '',
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-semibold text-label-sm tracking-wide ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            dotColor ??
            (tone === 'danger'
              ? 'bg-error'
              : tone === 'success'
                ? 'bg-success'
                : tone === 'navy'
                  ? 'bg-primary-container'
                  : 'bg-secondary')
          }`}
        />
      )}
      {children}
    </span>
  );
};

