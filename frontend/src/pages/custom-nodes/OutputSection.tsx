import { BranchesEditor } from './BranchesEditor';
import type { OutputSectionProps } from './customNodes.types';
import { ResultEditor } from './ResultEditor';
import { Section } from './Section';

/** Output has two separate parts: the result (data) and the branches (paths). */
export function OutputSection({ spec, locked, classic, onChange, onInsert }: OutputSectionProps) {
  return (
    <Section
      step={3}
      title="Output"
      description={classic ? 'Where the flow goes after this node.' : 'What the node hands to the rest of the workflow: its result, and the branch to continue on.'}
    >
      {!classic && <ResultEditor resultName={spec.resultName ?? ''} resultSchema={spec.resultSchema ?? []} onChange={onChange} />}
      <BranchesEditor
        branches={spec.outputs}
        lockedIds={locked.branchIds}
        classic={classic}
        errorBranch={!!spec.errorBranch}
        onChange={onChange}
        onInsert={onInsert}
      />
    </Section>
  );
}
