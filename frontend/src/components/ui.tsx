import { ChevronDown, ChevronRight, Inbox, LoaderCircle, X } from 'lucide-react';
import { useState } from 'react';
import { pretty } from '../lib/format';
import { useEscapeKey } from '../lib/useEscapeKey';
import { toneFor } from './ui.helpers';
import type {
  BadgeProps,
  ButtonProps,
  DrawerProps,
  EmptyStateProps,
  ErrorStateProps,
  FieldGroupProps,
  FieldProps,
  JsonBlockProps,
  ModalProps,
  PageHeaderProps,
  SkeletonProps,
  StatusPillProps,
  TableSkeletonProps,
  ToggleProps,
} from './ui.types';

export function Badge({ tone = 'neutral', children, dot }: BadgeProps) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot && <span className="badge-dot" />}
      {children}
    </span>
  );
}

export function StatusPill({ status, label }: StatusPillProps) {
  const tone = toneFor(status);
  return (
    <span className={`badge badge-${tone} status-pill ${status === 'running' ? 'is-running' : ''}`}>
      <span className="badge-dot" />
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  children,
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={`btn btn-${variant} btn-${size} ${className}`}
      // After {...rest}: a caller's `disabled={false}` must not make a loading button clickable again.
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
    >
      {loading ? <LoaderCircle size={15} className="spin" /> : Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon size={22} />
      </div>
      <div className="empty-title">{title}</div>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function Skeleton({ w = '100%', h = 14, r = 6 }: SkeletonProps) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="card">
      <table className="table">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>
              {Array.from({ length: cols }).map((__, j) => (
                <td key={j}>
                  <Skeleton w={j === 0 ? '70%' : `${40 + ((i * 7 + j * 13) % 40)}%`} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="error-state">
      <div>
        <strong>Couldn't load data.</strong> {msg}
      </div>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  width = 520,
}: ModalProps) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {description && <p className="modal-desc">{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: DrawerProps) {
  useEscapeKey(open, onClose);
  if (!open) return null;
  return (
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-header">
          <div>
            <h2 className="modal-title">{title}</h2>
            {subtitle && <div className="modal-desc">{subtitle}</div>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Field({
  label,
  help,
  required,
  children,
  error,
}: FieldProps) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {error ? <span className="field-error">{error}</span> : help && <span className="field-help">{help}</span>}
    </label>
  );
}

/** Like Field, but a <div>: for button groups and switches, which must not sit inside a <label>. */
export function FieldGroup({
  label,
  help,
  required,
  inline,
  children,
}: FieldGroupProps) {
  return (
    <div className={`field${inline ? ' field-inline' : ''}`} role="group" aria-label={label}>
      <span className="field-label">
        {label}
        {required && <span className="req">*</span>}
      </span>
      {children}
      {help && <span className="field-help">{help}</span>}
    </div>
  );
}

export function JsonBlock({ label, value, tone, defaultOpen = true }: JsonBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`json-block ${tone === 'danger' ? 'json-danger' : ''}`}>
      {/* type="button": inside a form (Try it), a plain button would submit it and send the request again. */}
      <button type="button" className="json-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {label}
      </button>
      {open && <pre className="json-pre">{typeof value === 'string' ? value : pretty(value)}</pre>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, title }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" />
    </button>
  );
}
