import { CustomNode, CustomNodeVersion } from './custom-node.types';

export abstract class CustomNodeRepository {
  abstract create(node: CustomNode, version: CustomNodeVersion): Promise<void>;
  abstract saveVersion(node: CustomNode, version: CustomNodeVersion): Promise<void>;
  abstract findById(tenantId: string, id: string): Promise<CustomNode | null>;
  abstract findByType(tenantId: string, type: string): Promise<CustomNode | null>;
  abstract list(tenantId: string, includeArchived: boolean): Promise<CustomNode[]>;
  abstract setArchived(tenantId: string, id: string, archived: boolean): Promise<CustomNode | null>;
  abstract findVersion(tenantId: string, type: string, version: number): Promise<CustomNodeVersion | null>;
  abstract listVersions(tenantId: string, customNodeId: string): Promise<CustomNodeVersion[]>;
}
