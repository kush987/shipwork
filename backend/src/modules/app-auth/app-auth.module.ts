import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthProviderDoc, AuthProviderSchema } from './infrastructure/app-auth.schema';
import { MongoAuthProviderRepository } from './infrastructure/mongo-auth-provider.repository';
import { HttpJwksSource } from './infrastructure/http-jwks-source';
import { AuthProviderRepository } from './domain/app-auth.repository';
import { JwksSource } from './application/app-auth.ports';
import { AuthProviderService } from './application/auth-provider.service';
import { TokenService } from './application/token.service';

/**
 * Sign-in for the apps workspaces build (not for ShipFlow itself): providers, token checks for
 * JWT endpoints, and token issuing for Login APIs. Used by endpoints, the runtime gateway and nodes.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: AuthProviderDoc.name, schema: AuthProviderSchema }])],
  providers: [
    { provide: AuthProviderRepository, useClass: MongoAuthProviderRepository },
    { provide: JwksSource, useClass: HttpJwksSource },
    AuthProviderService,
    TokenService,
  ],
  exports: [AuthProviderService, TokenService],
})
export class AppAuthModule {}
