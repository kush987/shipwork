import { Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AccountMenu } from './account/AccountMenu';
import { writeStorage } from '../lib/storage';
import { PHONE_QUERY } from '../lib/format.constants';
import { useEscapeKey } from '../lib/useEscapeKey';
import { useMediaQuery } from '../lib/useMediaQuery';
import { FULL_BLEED_RE, NAV, SIDEBAR_KEY, THEME_KEY } from './Layout.constants';
import { currentNavItem, isTextEntry, readCollapsed, readTheme } from './Layout.helpers';
import type { Theme } from './Layout.types';

export function Layout() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const location = useLocation();
  // Phones: the menu is a drawer opened from the top bar, closed by navigating, tapping outside or Escape.
  const phone = useMediaQuery(PHONE_QUERY);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(closeMenu, [location.pathname, phone, closeMenu]);
  useEscapeKey(menuOpen, closeMenu);

  useEffect(() => {
    writeStorage('local', SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // ⌘/Ctrl+B toggles the menu, unless the user is typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'b' || e.shiftKey || e.altKey) return;
      if (isTextEntry(e.target as HTMLElement | null)) return;
      e.preventDefault();
      setCollapsed((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const fullBleed = FULL_BLEED_RE.test(location.pathname);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStorage('local', THEME_KEY, theme);
  }, [theme]);

  return (
    <div className={`app${collapsed && !phone ? ' is-collapsed' : ''}${menuOpen ? ' menu-open' : ''}${fullBleed ? ' app-full' : ''}`}>
      {phone && !fullBleed && (
        <header className="mobile-bar">
          <button type="button" className="icon-btn" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
            <Menu size={20} />
          </button>
          <span className="mobile-bar-title">{currentNavItem(location.pathname)?.label ?? 'ShipFlow'}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>
      )}
      {phone && menuOpen && <div className="sidebar-backdrop" onClick={closeMenu} aria-hidden />}
      {/* While the phone menu is closed it is off screen: inert keeps it out of tab order and screen readers (React 18 wants a string). */}
      <aside className="sidebar" aria-label="Main navigation" {...(phone && !menuOpen ? { inert: '' } : {})}>
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
              <path
                d="M7 10h11l6 6-6 6H7"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-name">ShipFlow</div>
            <div className="brand-tag">Workflow backend</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.title} className="nav-section" role="group" aria-label={section.title}>
              <div className="nav-section-label" aria-hidden>
                {section.title}
              </div>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  data-label={label}
                  aria-label={collapsed && !phone ? label : undefined}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon size={17} />
                  <span className="nav-label">{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="nav-item sidebar-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          data-label="Expand menu"
          title={`${collapsed ? 'Expand' : 'Collapse'} menu (⌘/Ctrl+B)`}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          <span className="nav-label">Collapse menu</span>
        </button>
        <div className="sidebar-footer">
          <AccountMenu />
          <button
            className="icon-btn theme-toggle"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
      </aside>
      <main className={`main ${fullBleed ? 'main-full' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}
