import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { BadgeTone } from '../../styles/designTokens';
import { ProgressBar } from './ProgressBar';
import { StatusBadge } from './StatusBadge';

interface KpiCardProps {
  eyebrow: string;
  badgeText?: string;
  badgeTone?: BadgeTone;
  badgeIcon?: React.ReactNode;
  value: string | number;
  valueClassName?: string;
  suffix?: React.ReactNode;
  delta?: string;
  footerLeft?: React.ReactNode;
  footerRight?: React.ReactNode;
  progress?: number;
  progressFillClass?: string;
  leftAccentClass?: string;
  iconBox?: React.ReactNode;
  onClick?: () => void;
}

export const KpiCard: React.FC<KpiCardProps> = ({
  eyebrow,
  badgeText,
  badgeTone = 'neutral',
  badgeIcon,
  value,
  valueClassName = 'text-on-surface',
  suffix,
  delta,
  footerLeft,
  footerRight,
  progress,
  progressFillClass = 'bg-secondary',
  leftAccentClass,
  iconBox,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-surface-container-lowest rounded-xl p-space-xl border border-border-hairline/80 shadow-exec-sm hover:shadow-exec-md transition-all relative overflow-hidden flex flex-col justify-between ${
        onClick ? 'cursor-pointer group' : ''
      }`}
    >
      {leftAccentClass && <div className={`absolute top-0 left-0 w-1.5 h-full ${leftAccentClass}`} />}

      <div className="flex items-start justify-between gap-2 mb-space-md">
        <span className="text-label-md text-outline tracking-wider uppercase">{eyebrow}</span>
        {badgeText && (
          <StatusBadge tone={badgeTone}>
            {badgeIcon}
            {badgeText}
          </StatusBadge>
        )}
        {iconBox}
      </div>

      <div>
        <div className="flex items-baseline gap-space-sm mb-space-xs">
          <span className={`text-display-lg tracking-tight font-extrabold tabular-nums ${valueClassName}`}>
            {value}
          </span>
          {suffix}
          {delta && (
            <span className="inline-flex items-center gap-0.5 text-label-sm text-secondary font-bold tabular-nums">
              <ArrowUpRight className="w-3.5 h-3.5" />
              {delta}
            </span>
          )}
        </div>
        {(footerLeft || footerRight) && (
          <div className="flex items-center justify-between gap-2 text-body-sm text-outline mt-1">
            <div>{footerLeft}</div>
            {footerRight && <div className="shrink-0">{footerRight}</div>}
          </div>
        )}
      </div>

      {typeof progress === 'number' && (
        <div className="mt-space-md">
          <ProgressBar value={progress} heightClass="h-1" fillClass={progressFillClass} />
        </div>
      )}
    </div>
  );
};

