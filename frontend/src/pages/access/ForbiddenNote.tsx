import { Lock } from 'lucide-react';
import { EmptyState } from '../../components/ui';
import type { ForbiddenNoteProps } from './access.types';

/** What a member sees instead of a part their role can't open (403). */
export function ForbiddenNote({ title, description }: ForbiddenNoteProps) {
  return (
    <div className="card">
      <EmptyState icon={Lock} title={title} description={description} />
    </div>
  );
}
