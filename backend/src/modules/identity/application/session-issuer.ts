import { Injectable } from '@nestjs/common';
import { newId } from '../../../shared/domain/id';
import { generateSecret, hashSecret } from '../../../shared/security/secrets';
import { SessionRepository } from '../domain/identity.repository';
import { SESSION_PREFIX, SESSION_TTL_MS } from '../domain/identity.constants';

/** Creates sessions: a random bearer token for the client, only its hash for the database. */
@Injectable()
export class SessionIssuer {
  constructor(private readonly sessions: SessionRepository) {}

  async issue(userId: string): Promise<{ token: string; expiresAt: string; sessionId: string }> {
    const token = generateSecret(SESSION_PREFIX, 32);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
    const sessionId = newId('ses');
    await this.sessions.create({ id: sessionId, userId, tokenHash: hashSecret(token), createdAt: now.toISOString(), expiresAt, lastUsedAt: now.toISOString() });
    return { token, expiresAt, sessionId };
  }
}
