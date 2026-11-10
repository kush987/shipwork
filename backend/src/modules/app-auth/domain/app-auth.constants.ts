export const PROVIDER_TYPES = ['shipflow', 'jwks', 'secret'] as const;

export const DEFAULT_ROLES_CLAIM = 'roles';
export const TOKEN_TTL_MINUTES = { min: 1, max: 30 * 24 * 60, default: 60 };
/** HS256 secrets shorter than this are guessable. */
export const MIN_SECRET_LENGTH = 32;
/** Bytes of randomness in the secret ShipFlow generates for its own providers. */
export const GENERATED_SECRET_BYTES = 48;

/** Signature algorithms accepted per provider type (never "none"; never HMAC with public keys). */
export const ASYMMETRIC_ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'ES512', 'EdDSA'];
export const HMAC_ALGORITHMS = ['HS256'];

/** Accepted clock difference between the token issuer and ShipFlow. */
export const CLOCK_TOLERANCE_SECONDS = 30;
