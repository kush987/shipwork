import { useState } from 'react';
import type { TestCaller } from '../api/types';
import { useJsonText } from '../lib/useJsonText';
import { RUN_AS_SAMPLE_ID } from './builder.constants';
import { splitList } from '../lib/format';
import type { CallerDraft, CallerKind } from './builder.types';

/** Form state of "Run as": the request.auth a test run of an API workflow pretends the caller had. */
export function useCallerDraft(): CallerDraft {
  const [kind, setKindState] = useState<CallerKind>('anonymous');
  const [id, setId] = useState('');
  const [roles, setRoles] = useState('');
  const claims = useJsonText({}, { expect: 'object', allowEmpty: true });
  const context = useJsonText({}, { expect: 'object', allowEmpty: true });

  const setKind = (next: CallerKind) => {
    setKindState(next);
    if (next !== 'anonymous' && (!id.trim() || Object.values(RUN_AS_SAMPLE_ID).includes(id))) setId(RUN_AS_SAMPLE_ID[next]);
  };

  const build = (): TestCaller | null => {
    if (kind === 'anonymous') return null;
    return {
      type: kind,
      id: id.trim(),
      roles: splitList(roles),
      claims: (claims.value as Record<string, unknown> | undefined) ?? {},
      context: (context.value as Record<string, unknown> | undefined) ?? {},
    };
  };

  const valid = kind === 'anonymous' || (!!id.trim() && claims.valid && context.valid);
  return { kind, setKind, id, setId, roles, setRoles, claims, context, valid, build };
}
