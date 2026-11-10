import { redactSecrets } from './redaction';

describe('redactSecrets', () => {
  it('masks secret-looking keys at any depth and keeps everything else', () => {
    const input = {
      request: { body: { email: 'a@b.co', password: 'hunter2-long', profile: { apiKey: 'sk_x', city: 'Pune' } }, headers: { authorization: 'Bearer x' } },
      context: { session: { token: 'eyJ…', expiresAt: '2026' }, user: { passwordHash: 'scrypt$…', roles: ['admin'] }, items: [{ client_secret: 's', qty: 2 }] },
      pickupPincode: '110020',
      empty: { password: '' },
    };
    expect(redactSecrets(input)).toEqual({
      request: { body: { email: 'a@b.co', password: '••••••', profile: { apiKey: '••••••', city: 'Pune' } }, headers: { authorization: '••••••' } },
      context: { session: { token: '••••••', expiresAt: '2026' }, user: { passwordHash: '••••••', roles: ['admin'] }, items: [{ client_secret: '••••••', qty: 2 }] },
      pickupPincode: '110020',
      empty: { password: '' },
    });
    expect(input.request.body.password).toBe('hunter2-long'); // the original is untouched
  });
});
