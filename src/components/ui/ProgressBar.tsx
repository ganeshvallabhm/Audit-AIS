import React from 'react';

interface ProgressBarProps {
  value: number;
  heightClass?: string;
  trackClass?: string;
  fillClass?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  heightClass = 'h-1',
  trackClass = 'bg-surface-container',
  fillClass = 'bg-secondary',
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`w-full ${trackClass} ${heightClass} rounded-full overflow-hidden`}>
      <div
        className={`${fillClass} h-full rounded-full transition-all duration-500`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
};

