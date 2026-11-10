import { Body, Controller, DefaultValuePipe, Get, HttpCode, Param, ParseBoolPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { EventDefinitionService } from '../application/event-definition.service';
import { EmitEventDto } from './dto/emit-event.dto';
import { EventDefinitionDto } from './dto/event-definition.dto';
import { CreateEventDefinitionDto } from './dto/create-event-definition.dto';
import { Area, Permission } from '../../../shared/auth/auth.decorators';

@ApiTags('events')
@Area('events')
@Controller()
export class EventController {
  constructor(private readonly events: EventDefinitionService) {}

  @Get('events/catalog')
  catalog(@TenantId() tenantId: string) {
    return this.events.catalog(tenantId);
  }

  /** For external systems (OMS, payments, CRM) and the UI: send a custom event about a shipment. */
  @Permission('events:emit')
  @Post('events/emit')
  @HttpCode(202)
  emit(@TenantId() tenantId: string, @Body() dto: EmitEventDto) {
    return this.events.emit(tenantId, dto, 'api');
  }

  @Get('event-definitions')
  list(@TenantId() tenantId: string, @Query('includeArchived', new DefaultValuePipe(false), ParseBoolPipe) includeArchived: boolean) {
    return this.events.list(tenantId, includeArchived);
  }

  @Post('event-definitions')
  create(@TenantId() tenantId: string, @Body() dto: CreateEventDefinitionDto) {
    return this.events.create(tenantId, dto);
  }

  @Put('event-definitions/:id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: EventDefinitionDto) {
    return this.events.update(tenantId, id, dto);
  }

  @Post('event-definitions/:id/archive')
  @HttpCode(200)
  archive(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.events.setArchived(tenantId, id, true);
  }

  @Post('event-definitions/:id/restore')
  @HttpCode(200)
  restore(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.events.setArchived(tenantId, id, false);
  }
}
