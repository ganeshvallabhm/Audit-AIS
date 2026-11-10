import React from 'react';
import { SearchX } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  return (
    <div className="py-14 px-6 text-center flex flex-col items-center justify-center">
      <div className="w-12 h-12 rounded-xl bg-surface-container-low border border-border-hairline flex items-center justify-center text-secondary mb-3">
        {icon ?? <SearchX className="w-6 h-6" />}
      </div>
      <h3 className="text-headline-md text-on-surface font-semibold">{title}</h3>
      <p className="text-body-sm text-on-surface-variant max-w-md mt-1 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary text-on-secondary text-label-lg hover:bg-secondary-container transition-colors shadow-exec-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

