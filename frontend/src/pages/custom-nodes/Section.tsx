import type { SectionProps } from './customNodes.types';

/** A numbered editor step with a one-line explanation of what it is for. */
export function Section({ step, title, description, actions, children }: SectionProps) {
  const headingId = `cn-step-${step}`;
  return (
    <section className="card cn-section" aria-labelledby={headingId}>
      <header className="cn-section-head">
        <span className="cn-step" aria-hidden>
          {step}
        </span>
        <div className="cn-section-titles">
          <h2 id={headingId} className="cn-section-title">
            {title}
          </h2>
          <p className="cn-section-desc">{description}</p>
        </div>
        {actions && <div className="cn-section-actions">{actions}</div>}
      </header>
      <div className="cn-section-body">{children}</div>
    </section>
  );
}
