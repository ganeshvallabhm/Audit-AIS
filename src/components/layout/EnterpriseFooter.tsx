import React from 'react';
import { Link } from 'react-router-dom';

export const EnterpriseFooter: React.FC = () => {
  return (
    <footer className="w-full bg-surface-container-lowest border-t border-border-hairline py-5 mt-auto">
      <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-label-lg text-on-surface font-semibold">CompanyAudit Platform</span>
          <span className="text-body-sm text-outline">
            © 2025 Audit Systems Group, Inc. All rights reserved. Confidential Fiduciary Oversight.
          </span>
        </div>
        <div className="flex items-center flex-wrap gap-6 text-label-md text-on-surface-variant">
          <Link className="hover:text-on-surface transition-colors" to="/company-profile">
            Audit Charter
          </Link>
          <Link className="hover:text-on-surface transition-colors" to="/risk-and-compliance">
            Security &amp; SOC2
          </Link>
          <span className="inline-flex items-center gap-2 text-on-surface-variant">
            <span className="w-2 h-2 rounded-full bg-success inline-block" />
            System Status: Operational
          </span>
        </div>
      </div>
    </footer>
  );
};
