import { Check, ChevronsUpDown, KeyRound, LogOut, ShieldCheck, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { setActiveTenant, signOut, useAuth } from '../../auth/auth-store';
import { LOGIN_PATH } from '../../auth/auth.constants';
import { activeMembership, initials, isReadOnly, roleNameOf } from '../../auth/auth.helpers';
import { useMyAccess } from '../../auth/useAccess';
import { useEscapeKey } from '../../lib/useEscapeKey';
import { Badge } from '../ui';
import { useToast } from '../useToast';
import { MENU_WIDTH } from './account.constants';
import { menuPosition } from './account.helpers';
import type { MenuPosition } from './account.types';
import { ChangePasswordModal } from './ChangePasswordModal';

/** The sidebar's account card: active workspace and user, with a menu to switch, manage and sign out. */
export function AccountMenu() {
  const auth = useAuth();
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const current = activeMembership(auth);
  const access = useMyAccess();
  const open = position !== null;
  const close = () => setPosition(null);

  useEscapeKey(open, close);
  // Closes on navigation and on clicks anywhere else.
  useEffect(() => setPosition(null), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    if (open || !trigger.current) return close();
    setPosition(menuPosition(trigger.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
  };

  const switchTo = (tenantId: string, name: string) => {
    close();
    if (tenantId === auth.activeTenantId) return;
    setActiveTenant(tenantId);
    navigate('/');
    toast.info(`Switched to ${name}`);
  };

  const logOut = async () => {
    close();
    await api.logout().catch(() => undefined); // the session ends locally either way
    signOut();
    navigate(LOGIN_PATH, { replace: true });
  };

  if (!current || !auth.user) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`tenant account-trigger${open ? ' is-open' : ''}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${current.tenantName} · ${auth.user.email}`}
      >
        <div className="tenant-avatar">{initials(current.tenantName)}</div>
        <div className="tenant-meta">
          <div className="tenant-name">{current.tenantName}</div>
          <div className="tenant-id">
            {current.tenantId} · {access.data?.role.name ?? roleNameOf(current)}
          </div>
          {access.data && isReadOnly(access.data.allowed) && (
            <span className="account-readonly">
              <Badge tone="neutral">Read-only</Badge>
            </span>
          )}
        </div>
        <ChevronsUpDown size={14} className="account-chevron" aria-hidden />
      </button>

      {open && (
        <div ref={menu} className="account-menu" role="menu" style={{ left: position.left, bottom: position.bottom, width: MENU_WIDTH }}>
          <div className="account-menu-user">
            <div className="account-user-avatar">{initials(auth.user.name, auth.user.email)}</div>
            <div className="account-user-meta">
              <div className="account-user-name">{auth.user.name}</div>
              <div className="account-user-email">{auth.user.email}</div>
            </div>
          </div>
          {auth.memberships.length > 1 && (
            <div className="account-menu-section" role="group" aria-label="Workspaces">
              <div className="account-menu-label">Workspaces</div>
              {auth.memberships.map((m) => (
                <button
                  key={m.tenantId}
                  type="button"
                  role="menuitemradio"
                  aria-checked={m.tenantId === auth.activeTenantId}
                  className="account-menu-item"
                  onClick={() => switchTo(m.tenantId, m.tenantName)}
                >
                  <span className="account-ws-avatar">{initials(m.tenantName)}</span>
                  <span className="account-ws-name">
                    {m.tenantName}
                    <span className="account-ws-role">{roleNameOf(m)}</span>
                  </span>
                  {m.tenantId === auth.activeTenantId && <Check size={14} className="account-check" aria-hidden />}
                </button>
              ))}
            </div>
          )}
          <div className="account-menu-section">
            <Link to="/settings/members" role="menuitem" className="account-menu-item" onClick={close}>
              <Users size={15} /> Members
            </Link>
            <Link to="/settings/access" role="menuitem" className="account-menu-item" onClick={close}>
              <ShieldCheck size={15} /> Access
            </Link>
            <button
              type="button"
              role="menuitem"
              className="account-menu-item"
              onClick={() => {
                close();
                setChangingPassword(true);
              }}
            >
              <KeyRound size={15} /> Change password
            </button>
            <button type="button" role="menuitem" className="account-menu-item" onClick={logOut}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      )}
      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </>
  );
}
