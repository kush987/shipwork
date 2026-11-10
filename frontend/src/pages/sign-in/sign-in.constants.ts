import type { AuthProviderType } from '../../api/types';
import type { SegmentedOption } from '../../components/Segmented.types';
import type { ProviderForm } from './sign-in.types';

export const PROVIDER_TYPE_LABEL: Record<AuthProviderType, string> = {
  shipflow: 'ShipFlow-issued',
  jwks: 'External (JWKS)',
  secret: 'Shared secret (HS256)',
};

export const PROVIDER_TYPE_OPTIONS: SegmentedOption<AuthProviderType>[] = [
  { value: 'shipflow', label: 'ShipFlow-issued' },
  { value: 'jwks', label: 'External (JWKS)' },
  { value: 'secret', label: 'Shared secret' },
];

/** One-paragraph explanation per provider type, shown in the create/edit dialog. */
export const PROVIDER_TYPE_HELP: Record<AuthProviderType, string> = {
  shipflow:
    'Tokens issued by your own Login API: its “Issue token” step signs them. ShipFlow generates the issuer and signing secret — nothing to set up.',
  jwks: 'Users sign in with an identity provider such as Auth0, Firebase, Cognito or Keycloak. ShipFlow checks each token against the provider’s public keys (JWKS).',
  secret: 'Tokens signed with a secret you share with your auth server (HS256). Paste the same secret here.',
};

export const PROVIDER_BADGE_TONE: Record<AuthProviderType, 'accent' | 'info' | 'violet'> = { shipflow: 'accent', jwks: 'info', secret: 'violet' };

/** The users of the apps workspaces build (Sign-up / Login APIs, the role-based authorizer read them). */
export const APP_USERS_COLLECTION = 'app_users';

/** App users the test-token form offers to sign in as. */
export const APP_USERS_SHOWN = 50;

/** The made-up user a test token is for when the workspace has no app users. */
export const SAMPLE_TOKEN_SUBJECT = 'user_123';

/** "Sign in as" choice for typing any user id instead of picking an app user. */
export const OTHER_USER = '';

export const DEFAULT_ROLES_CLAIM = 'roles';
export const DEFAULT_TOKEN_TTL_MINUTES = 60;
export const MIN_SECRET_LENGTH = 32;
export const TOKEN_TTL_LIMITS = { min: 1, max: 60 * 24 * 30 };

export const BLANK_PROVIDER_FORM: ProviderForm = {
  name: '',
  type: 'shipflow',
  issuer: '',
  audience: '',
  jwksUrl: '',
  secret: '',
  rolesClaim: DEFAULT_ROLES_CLAIM,
  tokenTtlMinutes: String(DEFAULT_TOKEN_TTL_MINUTES),
};
