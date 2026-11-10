import { hashPassword, verifyPassword } from './passwords';
import { generateSecret, hashSecret } from './secrets';

describe('passwords', () => {
  it('hashes with a random salt and verifies only the right password', async () => {
    const [a, b] = await Promise.all([hashPassword('correct horse battery'), hashPassword('correct horse battery')]);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse batterz', a)).toBe(false);
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });

  it('makes prefixed random secrets and stable hashes of them', () => {
    const secret = generateSecret('sfs_', 32);
    expect(secret).toMatch(/^sfs_[A-Za-z0-9_-]{43}$/);
    expect(hashSecret(secret)).toBe(hashSecret(secret));
    expect(hashSecret(secret)).not.toBe(hashSecret(generateSecret('sfs_', 32)));
  });
});
