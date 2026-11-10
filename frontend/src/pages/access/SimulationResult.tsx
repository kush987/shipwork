import { ShieldCheck, ShieldX } from 'lucide-react';
import { JsonBlock } from '../../components/ui';
import type { SimulationResultProps } from './access.types';

/** Allowed / Denied, why, and the statement of the role's policy that decided. */
export function SimulationResult({ result, statement }: SimulationResultProps) {
  const Icon = result.allowed ? ShieldCheck : ShieldX;
  return (
    <div className={`card sim-result ${result.allowed ? 'is-allowed' : 'is-denied'}`}>
      <div className="sim-verdict">
        <Icon size={22} aria-hidden />
        {result.allowed ? 'Allowed' : 'Denied'}
      </div>
      <p className="sim-reason">{result.reason}</p>
      <dl className="sim-facts">
        <dt>Role</dt>
        <dd>{result.role.name}</dd>
        <dt>Decided by</dt>
        <dd>{result.statement === null ? 'No statement matched — denied by default' : `Statement ${result.statement + 1} of the role’s policy`}</dd>
      </dl>
      {statement && <JsonBlock label={`Statement ${(result.statement ?? 0) + 1}`} value={statement} tone={statement.effect === 'deny' ? 'danger' : undefined} />}
    </div>
  );
}
