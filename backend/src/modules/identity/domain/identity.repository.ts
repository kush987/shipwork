import type { Membership, Session, Tenant, User } from './identity.types';
import type { CustomRole } from './access.types';

export abstract class UserRepository {
  abstract create(user: User): Promise<void>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract findByIds(ids: string[]): Promise<User[]>;
  abstract setPassword(id: string, passwordHash: string, at: string): Promise<void>;
}

export abstract class TenantRepository {
  abstract create(tenant: Tenant): Promise<void>;
  abstract findById(id: string): Promise<Tenant | null>;
  abstract findByIds(ids: string[]): Promise<Tenant[]>;
}

export abstract class MembershipRepository {
  abstract add(membership: Membership): Promise<void>;
  abstract find(userId: string, tenantId: string): Promise<Membership | null>;
  abstract forUser(userId: string): Promise<Membership[]>;
  abstract forTenant(tenantId: string): Promise<Membership[]>;
  abstract setRole(userId: string, tenantId: string, role: string): Promise<void>;
  abstract remove(userId: string, tenantId: string): Promise<void>;
}

/** Roles a workspace made (built-in roles are constants, not stored). */
export abstract class RoleRepository {
  abstract list(tenantId: string): Promise<CustomRole[]>;
  abstract find(tenantId: string, id: string): Promise<CustomRole | null>;
  abstract create(role: CustomRole): Promise<void>;
  abstract save(role: CustomRole): Promise<void>;
  abstract delete(tenantId: string, id: string): Promise<void>;
}

export abstract class SessionRepository {
  abstract create(session: Session): Promise<void>;
  abstract findByTokenHash(tokenHash: string): Promise<Session | null>;
  abstract touch(id: string, at: string): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract deleteForUser(userId: string, exceptId?: string): Promise<void>;
}
