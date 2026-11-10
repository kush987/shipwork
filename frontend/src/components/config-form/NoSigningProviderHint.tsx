import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SIGN_IN_PROVIDERS_PATH } from './config-form.constants';

/** Help text of the Issue token step's provider setting while no ShipFlow-issued provider exists. */
export function NoSigningProviderHint() {
  return (
    <>
      No ShipFlow-issued sign-in provider yet —{' '}
      <Link to={SIGN_IN_PROVIDERS_PATH} className="link-inline" target="_blank" rel="noreferrer">
        create one under App sign-in <ExternalLink size={12} />
      </Link>
    </>
  );
}
