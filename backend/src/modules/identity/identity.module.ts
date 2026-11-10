import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { MembershipDoc, MembershipSchema, RoleDoc, RoleSchema, SessionDoc, SessionSchema, TenantDoc, TenantSchema, UserDoc, UserSchema } from './infrastructure/identity.schema';
import { MongoMembershipRepository, MongoRoleRepository, MongoSessionRepository, MongoTenantRepository, MongoUserRepository } from './infrastructure/mongo-identity.repositories';
import { MembershipRepository, RoleRepository, SessionRepository, TenantRepository, UserRepository } from './domain/identity.repository';
import { AccessService } from './application/access.service';
import { AuthService } from './application/auth.service';
import { MembersService } from './application/members.service';
import { RolesService } from './application/roles.service';
import { SessionIssuer } from './application/session-issuer';
import { AuthController } from './presentation/auth.controller';
import { MembersController } from './presentation/members.controller';
import { AccessController, RolesController } from './presentation/roles.controller';
import { AuthGuard } from './presentation/auth.guard';

/** Accounts, workspaces, memberships, builder roles and sessions; guards the whole control plane. */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserDoc.name, schema: UserSchema },
      { name: TenantDoc.name, schema: TenantSchema },
      { name: MembershipDoc.name, schema: MembershipSchema },
      { name: SessionDoc.name, schema: SessionSchema },
      { name: RoleDoc.name, schema: RoleSchema },
    ]),
  ],
  controllers: [AuthController, MembersController, RolesController, AccessController],
  providers: [
    { provide: UserRepository, useClass: MongoUserRepository },
    { provide: TenantRepository, useClass: MongoTenantRepository },
    { provide: MembershipRepository, useClass: MongoMembershipRepository },
    { provide: SessionRepository, useClass: MongoSessionRepository },
    { provide: RoleRepository, useClass: MongoRoleRepository },
    AccessService,
    SessionIssuer,
    AuthService,
    MembersService,
    RolesService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [MembersService],
})
export class IdentityModule {}
