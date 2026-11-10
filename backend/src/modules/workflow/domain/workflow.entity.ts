import { InvalidOperationError } from '../../../shared/domain/errors';
import { WorkflowDefinition } from './workflow-definition.types';
import { WorkflowVersionProps, WorkflowProps } from './workflow.types';

/** Aggregate root. Owns the version pointers; versions themselves are immutable once published. */
export class Workflow {
  private constructor(private props: WorkflowProps) {}

  static create(input: { id: string; tenantId: string; name: string; description?: string }): Workflow {
    const now = new Date();
    return new Workflow({
      ...input,
      description: input.description ?? '',
      status: 'draft',
      triggerEvent: null,
      publishedVersion: null,
      latestVersion: 1,
      paused: false,
      pausedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: WorkflowProps): Workflow {
    return new Workflow({ ...props });
  }

  get id() {
    return this.props.id;
  }
  get tenantId() {
    return this.props.tenantId;
  }
  get latestVersion() {
    return this.props.latestVersion;
  }
  get publishedVersion() {
    return this.props.publishedVersion;
  }
  get isArchived() {
    return this.props.status === 'archived';
  }
  get isPaused() {
    return this.props.paused;
  }
  get name() {
    return this.props.name;
  }

  /** Allocates the next version number for a new draft. */
  nextVersion(): number {
    this.assertActive();
    this.props.latestVersion += 1;
    this.touch();
    return this.props.latestVersion;
  }

  markPublished(version: number, triggerEvent: string) {
    this.assertActive();
    this.props.publishedVersion = version;
    this.props.triggerEvent = triggerEvent;
    this.props.status = 'published';
    this.touch();
  }

  rename(name: string, description?: string) {
    this.props.name = name;
    if (description !== undefined) this.props.description = description;
    this.touch();
  }

  archive() {
    this.props.status = 'archived';
    this.touch();
  }

  /**
   * Stops every trigger from starting the workflow (endpoints, schedules, events, record changes, Run
   * workflow steps) without unpublishing it. Publishing a new version keeps it paused.
   */
  pause() {
    this.assertActive();
    if (!this.props.publishedVersion) throw new InvalidOperationError('Only a published workflow can be paused');
    if (this.props.paused) return;
    this.props.paused = true;
    this.props.pausedAt = new Date();
    this.touch();
  }

  /** Lets triggers start the workflow again, with the version that is published now. */
  resume() {
    this.assertActive();
    if (!this.props.paused) return;
    this.props.paused = false;
    this.props.pausedAt = null;
    this.touch();
  }

  toJSON(): WorkflowProps {
    return { ...this.props };
  }

  private assertActive() {
    if (this.isArchived) throw new InvalidOperationError('Workflow is archived');
  }

  private touch() {
    this.props.updatedAt = new Date();
  }
}

export class WorkflowVersion {
  private constructor(private props: WorkflowVersionProps) {}

  static draft(input: Omit<WorkflowVersionProps, 'status' | 'createdAt' | 'publishedAt'>): WorkflowVersion {
    return new WorkflowVersion({ ...input, status: 'draft', createdAt: new Date(), publishedAt: null });
  }

  static restore(props: WorkflowVersionProps) {
    return new WorkflowVersion({ ...props });
  }

  get version() {
    return this.props.version;
  }
  get status() {
    return this.props.status;
  }
  get definition() {
    return this.props.definition;
  }

  updateDefinition(definition: WorkflowDefinition) {
    if (this.props.status !== 'draft') {
      throw new InvalidOperationError(`Version ${this.props.version} is ${this.props.status} and cannot be edited`);
    }
    this.props.definition = definition;
  }

  publish() {
    if (this.props.status !== 'draft') throw new InvalidOperationError('Only drafts can be published');
    this.props.status = 'published';
    this.props.publishedAt = new Date();
  }

  supersede() {
    if (this.props.status === 'published') this.props.status = 'superseded';
  }

  toJSON(): WorkflowVersionProps {
    return { ...this.props };
  }
}
