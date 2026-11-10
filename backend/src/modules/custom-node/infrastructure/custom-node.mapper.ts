import { fromDocument, toIso } from '../../../shared/persistence/mongo-mapping';
import type { CustomNode, CustomNodeVersion } from '../domain/custom-node.types';
import type { CustomNodeDoc, CustomNodeVersionDoc } from './custom-node.schema';

export const toCustomNode = (doc: CustomNodeDoc): CustomNode => fromDocument<CustomNode>(doc as never);

/** Versions are keyed by `<customNodeId>@<version>` and are never updated after creation. */
export const toCustomNodeVersion = ({ _id, createdAt, ...rest }: CustomNodeVersionDoc): CustomNodeVersion => ({ ...rest, createdAt: toIso(createdAt) });

export const toCustomNodeVersionDoc = (version: CustomNodeVersion) => ({
  ...version,
  _id: `${version.customNodeId}@${version.version}`,
  createdAt: new Date(version.createdAt),
});
