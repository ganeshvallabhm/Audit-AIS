import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  eyebrow?: string;
  eyebrowIcon?: React.ReactNode;
  badge?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  breadcrumbs,
  eyebrow,
  eyebrowIcon,
  badge,
  title,
  description,
  actions,
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-border-hairline/80">
      <div className="space-y-2 max-w-3xl">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center flex-wrap gap-1.5 text-label-md text-outline">
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  {crumb.to && !isLast ? (
                    <Link to={crumb.to} className="hover:text-on-surface transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? 'text-secondary font-semibold' : ''}>{crumb.label}</span>
                  )}
                  {!isLast && <ChevronRight className="w-3.5 h-3.5 text-outline-variant shrink-0" />}
                </React.Fragment>
              );
            })}
          </nav>
        )}

        {eyebrow && (
          <div className="flex items-center gap-2 text-label-md uppercase tracking-wider text-secondary">
            {eyebrowIcon ?? <span className="inline-block w-2 h-2 rounded-full bg-secondary" />}
            <span>{eyebrow}</span>
          </div>
        )}

        <div className="flex items-center flex-wrap gap-3">
          <h1 className="text-display-lg text-primary tracking-tight">{title}</h1>
          {badge}
        </div>

        {description && (
          <p className="text-body-md text-on-surface-variant leading-relaxed max-w-2xl">{description}</p>
        )}
      </div>

      {actions && <div className="flex items-center flex-wrap gap-3 shrink-0">{actions}</div>}
    </div>
  );
};

