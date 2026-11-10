import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastBannerProps {
  message: string | null;
  onClose: () => void;
}

export const ToastBanner: React.FC<ToastBannerProps> = ({ message, onClose }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-primary-container text-white px-4 py-3 rounded-lg shadow-exec-lg border border-white/10 max-w-md animate-fade-in">
      <CheckCircle2 className="w-4 h-4 text-secondary-fixed shrink-0" />
      <span className="text-body-sm font-medium leading-snug">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className="ml-auto text-on-primary-container hover:text-white transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

