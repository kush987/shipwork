import type { AuthShellProps } from './auth-pages.types';

/** Centered card with the brand, used by the sign-in and sign-up pages (outside the app layout). */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-mark">
          <svg viewBox="0 0 32 32" width="18" height="18" aria-hidden>
            <path d="M7 10h11l6 6-6 6H7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <div className="brand-name">ShipFlow</div>
          <div className="brand-tag">Workflow backend</div>
        </div>
      </div>
      <main className="card auth-card">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </main>
      <div className="auth-footer">{footer}</div>
    </div>
  );
}
