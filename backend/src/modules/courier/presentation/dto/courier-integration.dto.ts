import { IsIn, IsObject, IsOptional } from 'class-validator';
import { INTEGRATION_ENVS, INTEGRATION_MODES } from '../../domain/courier-integration.constants';
import type { IntegrationEnv, IntegrationMode } from '../../domain/courier-integration.types';

export class UpdateIntegrationDto {
  @IsOptional() @IsIn(INTEGRATION_MODES as string[]) mode?: IntegrationMode;
  @IsOptional() @IsIn(INTEGRATION_ENVS as string[]) env?: IntegrationEnv;
  /** Setting key → value. A secret sent as '' keeps the saved one; null clears a setting. */
  @IsOptional() @IsObject() values?: Record<string, string | null>;
}

export class TestIntegrationDto {
  @IsIn(INTEGRATION_ENVS as string[]) env: IntegrationEnv;
}
