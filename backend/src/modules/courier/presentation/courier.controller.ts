import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CourierRegistry } from '../application/courier-registry';
import { CourierIntegrationService } from '../application/courier-integration.service';
import { UpdateCourierDto } from './dto/update-courier.dto';
import { TestIntegrationDto, UpdateIntegrationDto } from './dto/courier-integration.dto';
import { simulationOf, toCourierStatus } from '../infrastructure/courier-status.mapper';
import { Area, CurrentAuth, PlatformAdminWrites } from '../../../shared/auth/auth.decorators';
import type { AuthContext } from '../../../shared/auth/auth.types';

@ApiTags('couriers')
// Courier settings are shared by every workspace: members can read them, platform admins change them.
@PlatformAdminWrites()
@Area('couriers')
@Controller('couriers')
export class CourierController {
  constructor(
    private readonly registry: CourierRegistry,
    private readonly integrations: CourierIntegrationService,
  ) {}

  /** Each courier with its health and, when it has a real API adapter, its API connection (never a secret). */
  @Get()
  async list() {
    const integrations = await this.integrations.views();
    return this.registry.all().map((c) => ({ ...toCourierStatus(c), integration: integrations[c.provider.code] ?? null }));
  }

  /** Saves the API mode (simulated / sandbox / live) and/or one environment's settings. */
  @Put(':code/integration')
  async updateIntegration(@Param('code') code: string, @Body() dto: UpdateIntegrationDto, @CurrentAuth() auth: AuthContext) {
    this.registry.get(code);
    return this.integrations.update(code, dto, auth.userId);
  }

  /** Signs in with the sandbox or live settings and makes a harmless call. */
  @Post(':code/integration/test')
  @HttpCode(200)
  async testIntegration(@Param('code') code: string, @Body() dto: TestIntegrationDto) {
    this.registry.get(code);
    return this.integrations.test(code, dto.env);
  }

  @Patch(':code')
  async update(@Param('code') code: string, @Body() dto: UpdateCourierDto) {
    const courier = this.registry.get(code);
    if (dto.enabled !== undefined) this.registry.setEnabled(code, dto.enabled);
    const simulated = simulationOf(courier.provider);
    if (simulated) {
      const sim = simulated.profile.simulation;
      if (dto.failureRate !== undefined) sim.failureRate = dto.failureRate;
      if (dto.latencyMs !== undefined) sim.latencyMs = dto.latencyMs;
    }
    return { ...toCourierStatus(courier), integration: (await this.integrations.views())[code] ?? null };
  }
}
