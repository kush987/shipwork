import { exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from 'jose';
import { appAuthFixture, FakeJwks } from '../../../testing/app-auth-fakes';
import { decryptSecret } from '../../../shared/security/encryption';
import { TokenError } from './token.service.errors';
import { ValidationFailedError } from '../../../shared/domain/errors';

const hmac = (secret: string) => new TextEncoder().encode(secret);

describe('app sign-in tokens', () => {
  it('ShipFlow-issued: issues tokens its own provider accepts, with roles and claims', async () => {
    const { providers, tokens } = appAuthFixture();
    const p = await providers.create('t', { name: 'Shop app', type: 'shipflow' });
    expect(p).toMatchObject({ issuer: `shipflow:t:${p.id}`, rolesClaim: 'roles', tokenTtlMinutes: 60 });
    expect(p.encryptedSecret).toMatch(/^v1\./);
    const { token, expiresAt } = await tokens.issue('t', p.id, { sub: 'rec_1', roles: ['admin'], claims: { email: 'a@b.co' } });
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(59 * 60_000);
    expect(await tokens.verify('t', p.id, token)).toMatchObject({ sub: 'rec_1', roles: ['admin'], claims: { email: 'a@b.co', iss: p.issuer } });
  });

  it('rejects tampered, expired, unsigned and foreign tokens with plain reasons', async () => {
    const { providers, tokens } = appAuthFixture();
    const p = await providers.create('t', { name: 'Shop app', type: 'shipflow' });
    const other = await providers.create('t', { name: 'Other app', type: 'shipflow' });
    const { token } = await tokens.issue('t', p.id, { sub: 'u1' });
    const reason = (t: string, id = p.id) => tokens.verify('t', id, t).then(() => 'accepted', (e) => (e instanceof TokenError ? e.message : `unexpected ${e}`));

    const [h, body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), roles: ['admin'] })).toString('base64url');
    expect(await reason(`${h}.${forged}.${sig}`)).toBe('The token signature is not valid');
    // Every ShipFlow-issued provider has its own secret: another provider's token fails at the signature.
    expect(await reason(token, other.id)).toBe('The token signature is not valid');
    expect(await reason(new UnsecuredJWT({ sub: 'u1' }).setIssuer(p.issuer).encode())).toMatch(/algorithm|Not a valid token/);
    const secret = decryptSecret(p.encryptedSecret!);
    const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(p.issuer).setSubject('u1').setExpirationTime(Math.floor(Date.now() / 1000) - 120).sign(hmac(secret));
    expect(await reason(expired)).toBe('The token has expired');
    const noSub = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(p.issuer).setExpirationTime('5m').sign(hmac(secret));
    expect(await reason(noSub)).toBe('The token has no subject (sub)');
    expect(await reason('garbage')).toBe('Not a valid token');
  });

  it('external identity provider (JWKS): RS256 keys, audience, roles from a custom claim, key rotation', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwks = new FakeJwks({ keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' }] });
    const { providers, tokens } = appAuthFixture(jwks);
    const p = await providers.create('t', {
      name: 'Auth0',
      type: 'jwks',
      issuer: 'https://acme.eu.auth0.com/',
      audience: 'https://api.acme.com',
      jwksUrl: 'https://acme.eu.auth0.com/.well-known/jwks.json',
      rolesClaim: 'https://acme.com/roles',
    });
    const sign = (key = privateKey, kid = 'k1', aud = 'https://api.acme.com') =>
      new SignJWT({ 'https://acme.com/roles': ['ops'] }).setProtectedHeader({ alg: 'RS256', kid }).setIssuer(p.issuer).setAudience(aud).setSubject('auth0|42').setExpirationTime('10m').sign(key);

    expect(await tokens.verify('t', p.id, await sign())).toMatchObject({ sub: 'auth0|42', roles: ['ops'] });
    await expect(tokens.verify('t', p.id, await sign(privateKey, 'k1', 'https://other.api'))).rejects.toThrow("aud claim");

    // The provider rotates to a new key: the cached set doesn't know the kid, so it is read again once.
    const rotated = await generateKeyPair('RS256');
    jwks.keySet = { keys: [{ ...(await exportJWK(rotated.publicKey)), kid: 'k2', alg: 'RS256' }] };
    const reads = jwks.reads;
    expect(await tokens.verify('t', p.id, await sign(rotated.privateKey, 'k2'))).toMatchObject({ sub: 'auth0|42' });
    expect(jwks.reads).toBe(reads + 1);

    // An HMAC token "signed" with the public key must never pass (algorithm confusion).
    const confused = await new SignJWT({}).setProtectedHeader({ alg: 'HS256', kid: 'k2' }).setIssuer(p.issuer).setAudience('https://api.acme.com').setSubject('x').setExpirationTime('5m').sign(hmac('anything-at-all-anything-at-all-1'));
    await expect(tokens.verify('t', p.id, confused)).rejects.toThrow(TokenError);
  });

  it('shared secret provider (HS256) and its validation rules', async () => {
    const { providers, tokens } = appAuthFixture();
    const secret = 'a-shared-secret-of-at-least-32-chars!';
    const p = await providers.create('t', { name: 'Legacy', type: 'secret', issuer: 'legacy-app', secret });
    const token = await new SignJWT({ roles: 'admin ops' }).setProtectedHeader({ alg: 'HS256' }).setIssuer('legacy-app').setSubject('9').setExpirationTime('5m').sign(hmac(secret));
    expect(await tokens.verify('t', p.id, token)).toMatchObject({ sub: '9', roles: ['admin', 'ops'] });
    await expect(tokens.issue('t', p.id, { sub: '9' })).rejects.toThrow('Only ShipFlow-issued');

    const issues = (input: object) => providers.create('t', input as never).then(() => [], (e: ValidationFailedError) => e.issues.map((i) => i.message));
    expect(await issues({ name: 'x', type: 'secret', issuer: 'i', secret: 'short' })).toEqual(['The shared secret needs at least 32 characters']);
    expect(await issues({ name: 'x', type: 'jwks', issuer: 'i', jwksUrl: 'http://insecure' })).toEqual(['Enter the https URL of the JSON Web Key Set (JWKS)']);
    expect(await issues({ name: '', type: 'shipflow' })).toEqual(['Name the sign-in provider']);
    // Editing keeps the stored secret unless a new one is given; the type is fixed.
    await providers.update('t', p.id, { name: 'Legacy app', type: 'secret', issuer: 'legacy-app' });
    expect(await tokens.verify('t', p.id, token)).toMatchObject({ sub: '9' });
    await expect(providers.update('t', p.id, { name: 'x', type: 'shipflow' })).rejects.toThrow('cannot change');
  });
});
