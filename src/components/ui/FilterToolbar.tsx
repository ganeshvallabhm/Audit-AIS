import React from 'react';
import { RotateCcw, Search } from 'lucide-react';

interface FilterToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  activeFilterCount?: number;
  onReset?: () => void;
  children?: React.ReactNode;
  rightActions?: React.ReactNode;
}

export const FilterToolbar: React.FC<FilterToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  activeFilterCount = 0,
  onReset,
  children,
  rightActions,
}) => {
  const hasActiveFilters = searchValue.trim().length > 0 || activeFilterCount > 0;

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-border-hairline/80 shadow-exec-sm p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center flex-wrap gap-3 flex-1">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full h-10 pl-10 pr-4 rounded-lg bg-surface-container-low/70 border border-border-hairline text-body-sm text-on-surface placeholder:text-outline focus:bg-surface-container-lowest focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/15 transition-all"
          />
        </div>

        {children}

        {hasActiveFilters && onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-label-md text-secondary hover:bg-surface-container-low transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
          </button>
        )}
      </div>

      {rightActions && <div className="flex items-center flex-wrap gap-2.5 shrink-0">{rightActions}</div>}
    </div>
  );
};

