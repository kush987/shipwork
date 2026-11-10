import { Injectable } from '@nestjs/common';
import { EventDefinitionService } from '../../custom-event/application/event-definition.service';
import { DataSourceService } from '../../data/application/data-source.service';
import { AuthProviderService } from '../../app-auth/application/auth-provider.service';
import type { ConfigField } from '../../nodes/domain/workflow-node.types';
import { ReferenceChecker } from '../domain/reference-checker.types';
import { WorkflowRepository } from '../domain/workflow.repository';
import { HTTP_TRIGGER_EVENT } from '../../nodes/domain/triggers.constants';

/** Trigger events, "Emit event" targets and event settings of custom nodes must exist and be active. */
@Injectable()
export class EventReferenceChecker implements ReferenceChecker {
  readonly sources = ['events' as const, 'custom-events' as const];

  constructor(private readonly events: EventDefinitionService) {}

  async check(tenantId: string, value: string, field: ConfigField) {
    if (field.optionsSource === 'custom-events' && !value.startsWith('custom.')) return `${field.label} must be a custom event`;
    return (await this.events.exists(tenantId, value)) ? null : `event "${value}" doesn't exist or was archived`;
  }
}

/** Data nodes must point at an existing collection (or, for the read steps, built-in data). */
@Injectable()
export class CollectionReferenceChecker implements ReferenceChecker {
  readonly sources = ['collections' as const, 'data-sources' as const];

  constructor(private readonly dataSources: DataSourceService) {}

  async check(tenantId: string, value: string) {
    return (await this.dataSources.exists(tenantId, value)) ? null : `collection "${value}" doesn't exist — create it on the Data page`;
  }
}

/** Issue token steps must name an existing ShipFlow-issued sign-in provider. */
@Injectable()
export class AuthProviderReferenceChecker implements ReferenceChecker {
  readonly sources = ['auth-providers' as const];

  constructor(private readonly providers: AuthProviderService) {}

  async check(tenantId: string, value: string) {
    const provider = (await this.providers.list(tenantId)).find((p) => p.id === value);
    if (!provider) return `sign-in provider "${value}" doesn't exist — create it under Settings → App sign-in`;
    return provider.type === 'shipflow' ? null : `sign-in provider “${provider.name}” is not ShipFlow-issued, so it can't issue tokens`;
  }
}

/**
 * Run workflow steps must start a workflow that exists, is published and starts with an API request.
 * Reads the repository, not WorkflowService (which itself runs these checkers).
 */
@Injectable()
export class WorkflowReferenceChecker implements ReferenceChecker {
  readonly sources = ['workflows' as const];

  constructor(private readonly workflows: WorkflowRepository) {}

  async check(tenantId: string, value: string) {
    const workflow = await this.workflows.findById(tenantId, value);
    if (!workflow) return `workflow "${value}" doesn't exist`;
    const { name, status, publishedVersion, triggerEvent } = workflow.toJSON();
    if (status === 'archived') return `workflow “${name}” is archived`;
    if (!publishedVersion) return `workflow “${name}” isn't published yet — publish it first`;
    return triggerEvent === HTTP_TRIGGER_EVENT ? null : `workflow “${name}” doesn't start with an API request, so it can't be run from another workflow`;
  }
}
