import { Segmented } from '../../components/Segmented';
import { DECISION_FILTERS } from './access.constants';
import type { AuditFiltersBarProps } from './access.types';

export function AuditFiltersBar({ members, actor, decision, action, onActor, onDecision, onAction }: AuditFiltersBarProps) {
  return (
    <div className="toolbar audit-filters">
      <select className="input audit-actor" aria-label="Member" value={actor} onChange={(e) => onActor(e.target.value)} disabled={!members}>
        <option value="">Anyone</option>
        {members?.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name || m.email}
          </option>
        ))}
      </select>
      <Segmented label="Decision" value={decision} options={DECISION_FILTERS} onChange={onDecision} />
      <input
        className="input mono audit-action"
        type="search"
        aria-label="Action starts with"
        placeholder="Action, e.g. workflows:"
        spellCheck={false}
        autoCapitalize="off"
        value={action}
        onChange={(e) => onAction(e.target.value)}
      />
    </div>
  );
}
