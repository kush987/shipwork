import type { AuthProvider, AuthProviderInput, DataRecord } from '../../api/types';
import { splitList } from '../../lib/format';
import { BLANK_PROVIDER_FORM, DEFAULT_ROLES_CLAIM, DEFAULT_TOKEN_TTL_MINUTES, MIN_SECRET_LENGTH, TOKEN_TTL_LIMITS } from './sign-in.constants';
import type { AppUser, ProviderForm } from './sign-in.types';

/** An app_users record as someone to sign in as: their email (or name), and roles given as a list or "a, b". */
export function toAppUser(record: DataRecord): AppUser {
  const name = [record.email, record.name].find((v): v is string => typeof v === 'string' && v.trim() !== '');
  const roles = Array.isArray(record.roles) ? record.roles.map(String) : typeof record.roles === 'string' ? splitList(record.roles) : [];
  return { id: record.id, label: name ?? record.id, roles };
}

export const formFromProvider = (p: AuthProvider | null): ProviderForm =>
  p
    ? {
        name: p.name,
        type: p.type,
        issuer: p.issuer,
        audience: p.audience ?? '',
        jwksUrl: p.jwksUrl ?? '',
        secret: '',
        rolesClaim: p.rolesClaim,
        tokenTtlMinutes: String(p.tokenTtlMinutes),
      }
    : BLANK_PROVIDER_FORM;

const isHttpsUrl = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Why the form can't be saved yet (first problem), or undefined. The server checks the rest (e.g. private hosts). */
export function providerFormProblem(f: ProviderForm, editing: boolean): string | undefined {
  if (!f.name.trim()) return 'Give the provider a name';
  if (f.type !== 'shipflow' && !f.issuer.trim()) return 'Enter the issuer (the token’s iss claim)';
  if (f.type === 'jwks' && !isHttpsUrl(f.jwksUrl.trim())) return 'The JWKS URL must be an https:// address';
  if (f.type === 'secret' && !(editing && !f.secret) && f.secret.length < MIN_SECRET_LENGTH) {
    return `The shared secret must be at least ${MIN_SECRET_LENGTH} characters`;
  }
  if (f.type === 'shipflow') {
    const ttl = Number(f.tokenTtlMinutes);
    if (!Number.isInteger(ttl) || ttl < TOKEN_TTL_LIMITS.min || ttl > TOKEN_TTL_LIMITS.max) return `Token lifetime: ${TOKEN_TTL_LIMITS.min}–${TOKEN_TTL_LIMITS.max} minutes`;
  }
  return undefined;
}

/** The request body for the form; only the fields the provider's type uses, and no empty secret. */
export function toProviderInput(f: ProviderForm): AuthProviderInput {
  const base: AuthProviderInput = { name: f.name.trim(), type: f.type, rolesClaim: f.rolesClaim.trim() || DEFAULT_ROLES_CLAIM };
  const audience = f.audience.trim() ? { audience: f.audience.trim() } : {};
  if (f.type === 'shipflow') return { ...base, ...audience, tokenTtlMinutes: Number(f.tokenTtlMinutes) || DEFAULT_TOKEN_TTL_MINUTES };
  if (f.type === 'jwks') return { ...base, ...audience, issuer: f.issuer.trim(), jwksUrl: f.jwksUrl.trim() };
  return { ...base, ...audience, issuer: f.issuer.trim(), ...(f.secret ? { secret: f.secret } : {}) };
}
