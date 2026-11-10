import { CustomNode, CustomNodeSpec, CustomNodeVersion } from '../modules/custom-node/domain/custom-node.types';
import { CustomNodeRepository } from '../modules/custom-node/domain/custom-node.repository';

export class InMemoryCustomNodes extends CustomNodeRepository {
  nodes = new Map<string, CustomNode>();
  versions: CustomNodeVersion[] = [];
  async create(node: CustomNode, version: CustomNodeVersion) {
    this.nodes.set(node.id, structuredClone(node));
    this.versions.push(structuredClone(version));
  }
  async saveVersion(node: CustomNode, version: CustomNodeVersion) {
    this.versions.push(structuredClone(version));
    this.nodes.set(node.id, structuredClone(node));
  }
  async findById(_: string, id: string) {
    return structuredClone(this.nodes.get(id) ?? null);
  }
  async findByType(_: string, type: string) {
    return structuredClone([...this.nodes.values()].find((n) => n.type === type) ?? null);
  }
  async list(_: string, includeArchived: boolean) {
    return [...this.nodes.values()].filter((n) => includeArchived || !n.archived);
  }
  async setArchived(_: string, id: string, archived: boolean) {
    const n = this.nodes.get(id);
    if (!n) return null;
    n.archived = archived;
    return structuredClone(n);
  }
  async findVersion(_: string, type: string, version: number) {
    return structuredClone(this.versions.find((v) => v.type === type && v.version === version) ?? null);
  }
  async listVersions(_: string, id: string) {
    return this.versions.filter((v) => v.customNodeId === id).reverse();
  }
}

export const riskNodeSpec = (code?: string): CustomNodeSpec => ({
  label: 'COD risk check',
  description: 'Flags high COD',
  icon: 'scale',
  configSchema: [{ key: 'threshold', label: 'Threshold', kind: 'number', required: true, default: 2000 }],
  outputs: [
    { id: 'risky', label: 'Risky' },
    { id: 'safe', label: 'Safe' },
  ],
  code:
    code ??
    `function run({ config, shipment }) {
       const risky = shipment.codAmount > Number(config.threshold);
       console.log('cod', shipment.codAmount);
       return { outputHandle: risky ? 'risky' : 'safe', output: { risky }, context: { codRisk: risky ? 'high' : 'low' } };
     }`,
});

/** A simple-format node: run() returns the result; branch() picks the path. */
export const simpleNodeSpec = (code?: string, extra: Partial<CustomNodeSpec> = {}): CustomNodeSpec => ({
  label: 'COD risk check',
  description: 'Flags high COD',
  icon: 'scale',
  configSchema: [{ key: 'threshold', label: 'Threshold', kind: 'number', required: true, default: 2000 }],
  outputs: [
    { id: 'risky', label: 'Risky' },
    { id: 'safe', label: 'Safe' },
  ],
  code:
    code ??
    `function run({ config, shipment }) {
       const risky = shipment.codAmount > Number(config.threshold);
       return branch(risky ? 'risky' : 'safe', { risky, codAmount: shipment.codAmount });
     }`,
  apiVersion: 2,
  ...extra,
});
