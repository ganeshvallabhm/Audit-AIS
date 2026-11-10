import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Building2,
  CheckCheck,
  FileArchive,
  HelpCircle,
  History,
  Layers,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { RoleLiteral } from '../../types/api';

interface TopNavHeaderProps {
  onOpenCommandSearch: () => void;
  onNotify: (msg: string) => void;
}

const PRIMARY_NAV_ITEMS = [
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Audits', to: '/audits' },
  { label: 'Risk & Compliance', to: '/risk-and-compliance' },
  { label: 'Findings & Actions', to: '/findings-and-actions' },
  { label: 'Reports', to: '/reports' },
  { label: 'AI Assistant', to: '/ai-assistant' },
];

export const TopNavHeader: React.FC<TopNavHeaderProps> = ({ onOpenCommandSearch, onNotify }) => {
  const { user, isDemoMode, switchDemoRole, logout } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setNotifOpen(false);
    setProfileOpen(false);
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenCommandSearch();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onOpenCommandSearch]);

  const handleMarkAllRead = async () => {
    await markAllRead();
    onNotify('All governance alerts marked as read.');
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-surface-container-lowest/95 backdrop-blur-md border-b border-border-hairline">
      <div className="h-16 max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Left Brand Lockup */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="xl:hidden p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-lg bg-primary-container flex items-center justify-center shadow-exec-sm group-hover:bg-tertiary-container transition-colors">
              <ShieldCheck className="w-5 h-5 text-surface-bright" />
            </div>
            <div className="flex flex-col">
              <span className="text-headline-md text-on-surface tracking-tight leading-none font-bold">
                CompanyAudit
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-outline mt-1">
                Audit &amp; Analytics
              </span>
            </div>
          </Link>
        </div>

        {/* Center Primary Navigation */}
        <nav className="hidden xl:flex items-center gap-1" aria-label="Primary Navigation">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const isDashboardActive =
              item.to === '/dashboard' && (location.pathname === '/' || location.pathname === '/dashboard');
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => {
                  const active = isActive || isDashboardActive;
                  return active
                    ? 'px-3.5 py-2 text-label-lg bg-secondary-container text-on-secondary-container rounded-lg shadow-exec-sm transition-all'
                    : 'px-3.5 py-2 text-label-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-all font-medium';
                }}
              >
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right Global Search, Notifications, Help & Profile */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onOpenCommandSearch}
            className="hidden md:flex items-center justify-between w-60 lg:w-64 h-9 px-3 bg-surface-container-low/70 border border-border-hairline rounded-lg text-body-sm text-outline hover:border-secondary/60 hover:bg-surface-container-lowest transition-all"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="w-4 h-4 text-outline shrink-0" />
              <span className="truncate">Search audits, risks...</span>
            </span>
            <kbd className="font-mono text-[11px] text-outline bg-surface-container-lowest border border-border-hairline px-1.5 py-0.5 rounded shrink-0">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={onOpenCommandSearch}
            aria-label="Search"
            className="md:hidden p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1">
            {/* Notifications Popover */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-error text-on-error text-[10px] rounded-full flex items-center justify-center leading-none font-bold tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-50">
                  <div className="px-4 py-3.5 bg-surface-container-low border-b border-border-hairline flex items-center justify-between">
                    <div>
                      <h3 className="text-headline-sm text-on-surface font-bold">Governance Alerts</h3>
                      <p className="text-body-sm text-outline">{unreadCount} unread fiduciary notices</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleMarkAllRead()}
                      className="inline-flex items-center gap-1 text-label-sm text-secondary hover:underline"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      Mark all read
                    </button>
                  </div>
                  <div className="divide-y divide-surface-container max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center text-body-sm text-outline">
                        No governance alerts on record.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            if (n.unread) void markRead(n.id);
                            navigate(n.link);
                          }}
                          className={`w-full text-left px-4 py-3.5 hover:bg-surface-container-low transition-colors flex items-start gap-3 ${
                            n.unread ? 'bg-surface-container-low/40' : ''
                          }`}
                        >
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                              n.severity === 'critical'
                                ? 'bg-error'
                                : n.severity === 'warning'
                                  ? 'bg-warning'
                                  : 'bg-secondary'
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-label-lg text-on-surface font-semibold leading-snug">{n.title}</div>
                            <p className="text-body-sm text-on-surface-variant mt-0.5 line-clamp-2">{n.description}</p>
                            <span className="font-mono text-label-sm text-outline mt-1 block">{n.timeLabel}</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                  <div className="px-4 py-3 bg-surface-container-low border-t border-border-hairline flex justify-between items-center">
                    <Link
                      to="/notifications"
                      className="text-label-lg text-secondary hover:underline font-semibold"
                    >
                      Open Notification Center →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                onNotify('SOC 2 Type II & ISO 27001 Audit Governance Charter v4.8.2 — All telemetry feeds operational.')
              }
              className="hidden sm:inline-flex p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low rounded-lg transition-colors"
              aria-label="Help & Governance Charter"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>

          <div className="h-6 w-px bg-border-hairline" />

          {/* Executive User Profile Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className="flex items-center gap-2.5 pl-1.5 pr-1 py-1 rounded-lg hover:bg-surface-container-low transition-colors cursor-pointer"
            >
              <div className="text-right hidden sm:flex flex-col">
                <span className="text-label-lg text-on-surface leading-tight">
                  {user?.full_name || 'Authenticated User'}
                </span>
                <span className="text-label-sm text-outline leading-none font-medium mt-0.5">
                  {user?.role || 'Viewer'}
                  {isDemoMode ? ' (Demo)' : ''}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary shrink-0 text-label-sm font-bold">
                {user?.initials || <User className="w-4 h-4" />}
              </div>
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-surface-container-lowest rounded-xl border border-border-hairline shadow-exec-lg overflow-hidden z-50">
                <div className="px-4 py-3.5 bg-surface-container-low border-b border-border-hairline">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-headline-sm text-on-surface font-bold truncate">{user?.full_name}</div>
                    <span className="px-2 py-0.5 rounded bg-secondary-fixed text-secondary text-[11px] font-bold shrink-0">
                      {user?.role}
                    </span>
                  </div>
                  <div className="text-body-sm text-on-surface-variant truncate">{user?.job_title || user?.email}</div>
                  {user && user.certifications.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {user.certifications.map((cert) => (
                        <span
                          key={cert}
                          className="px-2 py-0.5 rounded bg-surface-container-highest text-secondary font-mono text-label-sm font-bold"
                        >
                          {cert}
                        </span>
                      ))}
                    </div>
                  )}

                  {isDemoMode && (
                    <div className="mt-3 pt-2.5 border-t border-border-hairline/70">
                      <label className="block text-[11px] uppercase tracking-wider text-outline mb-1">
                        Demo RBAC Persona
                      </label>
                      <select
                        value={user?.role || 'Admin'}
                        onChange={(e) => {
                          const r = e.target.value as RoleLiteral;
                          switchDemoRole(r);
                          onNotify(`Switched offline Demo Mode persona to ${r}.`);
                        }}
                        className="w-full h-8 px-2 rounded border border-border-hairline bg-surface-container-lowest text-label-md text-on-surface"
                      >
                        <option value="Admin">Admin (CAO)</option>
                        <option value="Auditor">Auditor</option>
                        <option value="Department Head">Department Head</option>
                        <option value="Management">Management</option>
                        <option value="Viewer">Viewer (Read-Only)</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="py-1.5">
                  <Link
                    to="/company-profile"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-secondary" />
                    <span>Company Profile</span>
                  </Link>
                  <Link
                    to="/departments"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <Layers className="w-4 h-4 text-secondary" />
                    <span>Departments (8 Units)</span>
                  </Link>
                  <Link
                    to="/audits/evidence"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <FileArchive className="w-4 h-4 text-secondary" />
                    <span>Evidence Management</span>
                  </Link>
                  <Link
                    to="/audits/history"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors"
                  >
                    <History className="w-4 h-4 text-secondary" />
                    <span>Audit History &amp; Trail</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-on-surface hover:bg-surface-container-low transition-colors border-t border-surface-container mt-1 pt-2.5"
                  >
                    <Settings className="w-4 h-4 text-outline" />
                    <span>Platform Settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-body-sm text-error hover:bg-error-container/30 transition-colors border-t border-surface-container mt-1 pt-2.5"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>{isDemoMode ? 'Exit Demo Mode / Sign In' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Responsive Mobile / Tablet Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="xl:hidden bg-surface-container-lowest border-b border-border-hairline px-4 sm:px-6 py-4 space-y-3 shadow-exec-md">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PRIMARY_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? 'px-3.5 py-2.5 rounded-lg bg-secondary-container text-on-secondary-container text-label-lg font-semibold'
                    : 'px-3.5 py-2.5 rounded-lg text-on-surface-variant hover:bg-surface-container-low text-label-lg font-medium'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="pt-3 border-t border-surface-container flex flex-wrap gap-2 text-label-md text-secondary">
            <Link to="/company-profile" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Company Profile
            </Link>
            <Link to="/departments" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Departments
            </Link>
            <Link to="/audits/checklists" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Checklists
            </Link>
            <Link to="/audits/evidence" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Evidence
            </Link>
            <Link to="/audits/history" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Audit History
            </Link>
            <Link to="/settings" className="px-2.5 py-1.5 rounded-lg bg-surface-container-low">
              Settings
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
