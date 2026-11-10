import { FlowNodeComponent } from './FlowNode';

/** React Flow node renderers. Kept apart from builder.constants so FlowNode can use the builder helpers without a cycle. */
export const NODE_TYPES = { shipflow: FlowNodeComponent };
