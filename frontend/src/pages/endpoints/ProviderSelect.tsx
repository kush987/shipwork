import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Field } from '../../components/ui';
import { SIGN_IN_PROVIDERS_PATH } from '../../components/config-form/config-form.constants';
import { PROVIDER_TYPE_LABEL } from '../sign-in/sign-in.constants';
import type { ProviderSelectProps } from './endpoints.types';

/** Which sign-in provider verifies the tokens a JWT endpoint receives. */
export function ProviderSelect({ value, onChange, providers }: ProviderSelectProps) {
  const manage = (
    <Link to={SIGN_IN_PROVIDERS_PATH} className="link-inline" target="_blank" rel="noreferrer">
      {providers?.length ? 'Manage sign-in providers' : 'Create a sign-in provider first'} <ExternalLink size={12} />
    </Link>
  );
  return (
    <Field label="Sign-in provider" required help={manage}>
      <select className="input" value={value ?? ''} disabled={!providers?.length} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{providers === undefined ? 'Loading…' : providers.length ? 'Select a provider…' : 'No sign-in providers yet'}</option>
        {providers?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {PROVIDER_TYPE_LABEL[p.type]}
          </option>
        ))}
      </select>
    </Field>
  );
}
