import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WorkflowService } from '../application/workflow.service';
import { TenantId } from '../../../shared/tenant/tenant.decorator';
import { CreateWorkflowDto, DefinitionBodyDto } from './workflow.dto';
import { DuplicateWorkflowDto } from './dto/duplicate-workflow.dto';
import { Area, Permission } from '../../../shared/auth/auth.decorators';

@ApiTags('workflows')
@Area('workflows')
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflows: WorkflowService) {}

  @Get()
  list(@TenantId() tenantId: string) {
    return this.workflows.list(tenantId);
  }

  @Get('templates')
  templates() {
    return this.workflows.templates();
  }

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateWorkflowDto) {
    return this.workflows.create(tenantId, dto);
  }

  /** Copies a workflow (its draft, else its published version, or `version`) as a new draft workflow. */
  @Post(':id/duplicate')
  duplicate(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: DuplicateWorkflowDto) {
    return this.workflows.duplicate(tenantId, id, dto);
  }

  @Get(':id')
  get(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workflows.get(tenantId, id);
  }

  @Get(':id/versions/:version')
  async version(@TenantId() tenantId: string, @Param('id') id: string, @Param('version', ParseIntPipe) version: number) {
    return (await this.workflows.getVersion(tenantId, id, version)).toJSON();
  }

  @Put(':id/draft')
  saveDraft(@TenantId() tenantId: string, @Param('id') id: string, @Body() body: DefinitionBodyDto) {
    return this.workflows.saveDraft(tenantId, id, body.definition);
  }

  @Permission('workflows:read')
  @Post(':id/validate')
  @HttpCode(200)
  validate(@TenantId() tenantId: string, @Body() body: DefinitionBodyDto) {
    return this.workflows.validate(tenantId, body.definition);
  }

  @Permission('workflows:publish')
  @Post(':id/publish')
  @HttpCode(200)
  publish(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workflows.publish(tenantId, id);
  }

  /** Stops every trigger from starting it, without unpublishing it. */
  @Permission('workflows:publish')
  @Post(':id/pause')
  @HttpCode(200)
  pause(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workflows.pause(tenantId, id);
  }

  @Permission('workflows:publish')
  @Post(':id/resume')
  @HttpCode(200)
  resume(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workflows.resume(tenantId, id);
  }

  @Delete(':id')
  @HttpCode(204)
  archive(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.workflows.archive(tenantId, id);
  }
}
