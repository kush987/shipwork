import { readStorage } from '../lib/storage';
import { NAV, SIDEBAR_KEY, TEXT_ENTRY_TAGS, THEME_KEY } from './Layout.constants';
import type { NavItem, Theme } from './Layout.types';

export function readCollapsed(): boolean {
  return readStorage('local', SIDEBAR_KEY) === '1';
}

export function readTheme(): Theme {
  const t = readStorage('local', THEME_KEY);
  return t === 'light' || t === 'dark' ? t : 'light';
}

/** Whether a key press happens while the user is typing somewhere. */
export const isTextEntry = (t: HTMLElement | null) => !!t && (t.isContentEditable || TEXT_ENTRY_TAGS.includes(t.tagName));

/** The menu item the page belongs to (the longest matching path), for the phone top bar's title. */
export function currentNavItem(pathname: string): NavItem | undefined {
  const items = NAV.flatMap((section) => section.items);
  const matches = items.filter((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));
  return matches.sort((a, b) => b.to.length - a.to.length)[0];
}
