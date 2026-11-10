import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  eyebrow?: React.ReactNode;
  title: string;
  subtitle?: string;
  widthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onClose,
  eyebrow,
  title,
  subtitle,
  widthClass = 'max-w-xl',
  children,
  footer,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div
        className="fixed inset-0 bg-primary/35 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />
      <div
        className={`relative w-full ${widthClass} bg-surface-container-lowest h-full shadow-exec-lg border-l border-border-hairline flex flex-col z-10`}
      >
        <div className="px-6 py-5 bg-surface-container-low/70 border-b border-border-hairline flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1 min-w-0">
            {eyebrow && <div className="flex items-center flex-wrap gap-2">{eyebrow}</div>}
            <h2 className="text-headline-lg text-primary font-bold leading-snug">{title}</h2>
            {subtitle && <p className="text-body-sm text-on-surface-variant">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail panel"
            className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>

        {footer && (
          <div className="px-6 py-4 bg-surface-container-low/60 border-t border-border-hairline shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

