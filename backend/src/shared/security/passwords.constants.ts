/** scrypt cost parameters (OWASP-recommended minimum N=2^17 is slow in tests; 2^15 · r 8 ≈ 32 MB, ~50 ms). */
export const SCRYPT = { N: 1 << 15, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 } as const;

export const PASSWORD_HASH_PREFIX = 'scrypt';
