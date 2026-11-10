import { CornerDownLeft, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge, Toggle } from '../../components/ui';
import { FAILED_BRANCH, MAX_BRANCHES } from './customNodes.constants';
import { branchProblems, followsLabel, toBranchId, uniqueName } from './customNodes.helpers';
import type { BranchesEditorProps } from './customNodes.types';

/** Branches: the paths the flow can take after the node. */
export function BranchesEditor({ branches, lockedIds, classic, errorBranch, onChange, onInsert }: BranchesEditorProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const problems = useMemo(() => branchProblems(branches, classic), [branches, classic]);
  const update = (i: number, patch: Partial<(typeof branches)[number]>) => onChange({ outputs: branches.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const setLabel = (i: number, label: string) => {
    const b = branches[i];
    // The id follows the label until edited — unless saved workflows are already connected to it.
    const follows = !lockedIds.includes(b.id) && followsLabel(b.id, b.label, toBranchId);
    update(i, follows ? { label, id: toBranchId(label) } : { label });
  };
  const add = () => {
    const ids = branches.map((b) => b.id);
    const label = `Branch ${branches.length + 1}`;
    onChange({ outputs: [...branches, { id: uniqueName(toBranchId(label), ids), label }] });
  };
  const codeFor = (id: string) => (classic ? `outputHandle: '${id}'` : `return branch('${id}', result);`);

  return (
    <div className="cn-subpart">
      <h3 className="cn-subpart-title">Branches — where the flow goes next</h3>
      <p className="cn-subpart-desc">
        {branches.length > 1 ? (
          classic ? (
            <>
              Your code picks one by returning <span className="mono">outputHandle: 'id'</span>. Without it, the first branch is used.
            </>
          ) : (
            <>
              Your code picks one with <span className="mono">branch('id', result)</span>. Without it, the first branch is used.
            </>
          )
        ) : (
          'No branching — the flow always continues on the one branch. Add another to send some runs a different way.'
        )}
      </p>
      <div className="cn-branches">
        {branches.map((b, i) => (
          <div key={i} className={`cn-branch${problems[i].length ? ' has-problems' : ''}`}>
            <div className="cn-branch-row">
              <input className="input" aria-label={`Branch ${i + 1} label`} placeholder="e.g. Risky" value={b.label} onChange={(e) => setLabel(i, e.target.value)} />
              {editingId === i ? (
                <input
                  className="input mono cn-branch-id"
                  aria-label={`Branch ${i + 1} id`}
                  value={b.id}
                  autoFocus
                  onChange={(e) => update(i, { id: e.target.value })}
                  onBlur={() => setEditingId(null)}
                />
              ) : (
                <button type="button" className="cn-id-chip mono" title="Edit the id" onClick={() => setEditingId(i)}>
                  {b.id || '…'}
                </button>
              )}
              <button type="button" className="icon-btn" aria-label={`Remove branch ${b.label || i + 1}`} disabled={branches.length === 1} onClick={() => onChange({ outputs: branches.filter((_, j) => j !== i) })}>
                <Trash2 size={14} />
              </button>
            </div>
            <div className="cn-branch-meta">
              {i === 0 && <Badge tone="neutral">default</Badge>}
              {branches.length > 1 && b.id && (
                <button type="button" className="cn-snippet mono" title="Insert into the code" onClick={() => onInsert(codeFor(b.id))}>
                  <CornerDownLeft size={11} /> {classic ? `outputHandle: '${b.id}'` : `branch('${b.id}')`}
                </button>
              )}
              {lockedIds.includes(b.id) && <span className="muted small">workflows connect to this id</span>}
            </div>
            {problems[i].length > 0 && (
              <ul className="cn-problems">
                {problems[i].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {branches.length < MAX_BRANCHES ? (
        <button type="button" className="link-inline" onClick={add}>
          <Plus size={13} /> Add branch
        </button>
      ) : (
        <p className="muted small">A node can have at most {MAX_BRANCHES} branches.</p>
      )}
      {!classic && (
        <div className="cn-error-branch">
          <Toggle checked={errorBranch} onChange={(v) => onChange({ errorBranch: v })} label="Add a Failed branch" />
          <div>
            <div className="cn-error-branch-title">Add a “{FAILED_BRANCH.label}” branch</div>
            <div className="muted small">
              Catch errors from this node: when it throws or calls <span className="mono">fail()</span>, the flow continues on {FAILED_BRANCH.label} (if
              connected) instead of stopping the run.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
