import { WorkflowDefinition } from './workflow-definition.types';

export type WorkflowStatus = 'draft' | 'published' | 'archived';

export type VersionStatus = 'draft' | 'published' | 'superseded';

export interface WorkflowProps {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  triggerEvent: string | null;
  publishedVersion: number | null;
  latestVersion: number;
  /** A paused workflow keeps its published version, but no trigger starts it until it is resumed. */
  paused: boolean;
  pausedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowVersionProps {
  id: string;
  tenantId: string;
  workflowId: string;
  version: number;
  status: VersionStatus;
  definition: WorkflowDefinition;
  createdAt: Date;
  publishedAt: Date | null;
}
