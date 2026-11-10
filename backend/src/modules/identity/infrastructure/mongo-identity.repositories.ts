import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MembershipRepository, RoleRepository, SessionRepository, TenantRepository, UserRepository } from '../domain/identity.repository';
import { MembershipDoc, RoleDoc, SessionDoc, TenantDoc, UserDoc } from './identity.schema';
import { toMembership, toRole, toRoleDoc, toSession, toSessionDoc, toTenant, toTenantDoc, toUser, toUserDoc } from './identity.mapper';
import type { Membership, Session, Tenant, User } from '../domain/identity.types';
import type { CustomRole } from '../domain/access.types';

@Injectable()
export class MongoUserRepository extends UserRepository {
  constructor(@InjectModel(UserDoc.name) private readonly model: Model<UserDoc>) {
    super();
  }
  async create(user: User) {
    await this.model.create(toUserDoc(user));
  }
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    return doc ? toUser(doc) : null;
  }
  async findByEmail(email: string) {
    const doc = await this.model.findOne({ email }).lean();
    return doc ? toUser(doc) : null;
  }
  async findByIds(ids: string[]) {
    return ids.length ? (await this.model.find({ _id: { $in: ids } }).lean()).map(toUser) : [];
  }
  async setPassword(id: string, passwordHash: string, at: string) {
    await this.model.updateOne({ _id: id }, { $set: { passwordHash, updatedAt: new Date(at) } });
  }
}

@Injectable()
export class MongoTenantRepository extends TenantRepository {
  constructor(@InjectModel(TenantDoc.name) private readonly model: Model<TenantDoc>) {
    super();
  }
  async create(tenant: Tenant) {
    await this.model.create(toTenantDoc(tenant));
  }
  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    return doc ? toTenant(doc) : null;
  }
  async findByIds(ids: string[]) {
    return ids.length ? (await this.model.find({ _id: { $in: ids } }).lean()).map(toTenant) : [];
  }
}

@Injectable()
export class MongoMembershipRepository extends MembershipRepository {
  constructor(@InjectModel(MembershipDoc.name) private readonly model: Model<MembershipDoc>) {
    super();
  }
  async add(m: Membership) {
    await this.model.create({ ...m, createdAt: new Date(m.createdAt) });
  }
  async find(userId: string, tenantId: string) {
    const doc = await this.model.findOne({ userId, tenantId }).lean();
    return doc ? toMembership(doc) : null;
  }
  async forUser(userId: string) {
    return (await this.model.find({ userId }).sort({ createdAt: 1 }).lean()).map(toMembership);
  }
  async forTenant(tenantId: string) {
    return (await this.model.find({ tenantId }).sort({ createdAt: 1 }).lean()).map(toMembership);
  }
  async setRole(userId: string, tenantId: string, role: string) {
    await this.model.updateOne({ userId, tenantId }, { $set: { role } });
  }
  async remove(userId: string, tenantId: string) {
    await this.model.deleteOne({ userId, tenantId });
  }
}

@Injectable()
export class MongoSessionRepository extends SessionRepository {
  constructor(@InjectModel(SessionDoc.name) private readonly model: Model<SessionDoc>) {
    super();
  }
  async create(session: Session) {
    await this.model.create(toSessionDoc(session));
  }
  async findByTokenHash(tokenHash: string) {
    const doc = await this.model.findOne({ tokenHash }).lean();
    return doc ? toSession(doc) : null;
  }
  async touch(id: string, at: string) {
    await this.model.updateOne({ _id: id }, { $set: { lastUsedAt: new Date(at) } });
  }
  async delete(id: string) {
    await this.model.deleteOne({ _id: id });
  }
  async deleteForUser(userId: string, exceptId?: string) {
    await this.model.deleteMany({ userId, ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  }
}

@Injectable()
export class MongoRoleRepository extends RoleRepository {
  constructor(@InjectModel(RoleDoc.name) private readonly model: Model<RoleDoc>) {
    super();
  }
  async list(tenantId: string) {
    return (await this.model.find({ tenantId }).sort({ createdAt: 1 }).lean()).map(toRole);
  }
  async find(tenantId: string, id: string) {
    const doc = await this.model.findOne({ _id: id, tenantId }).lean();
    return doc ? toRole(doc) : null;
  }
  async create(role: CustomRole) {
    await this.model.create(toRoleDoc(role));
  }
  async save(role: CustomRole) {
    const { _id, ...rest } = toRoleDoc(role);
    await this.model.updateOne({ _id, tenantId: role.tenantId }, { $set: rest });
  }
  async delete(tenantId: string, id: string) {
    await this.model.deleteOne({ _id: id, tenantId });
  }
}
