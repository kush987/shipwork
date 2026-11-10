import { BuiltinNodeEditRepository } from '../modules/builtin-node/domain/builtin-node-edit.repository';
import type { BuiltinNodeEdit } from '../modules/builtin-node/domain/builtin-node-edit.types';

/** Versions of built-in step edits, in memory. */
export class InMemoryBuiltinNodeEdits extends BuiltinNodeEditRepository {
  readonly rows: BuiltinNodeEdit[] = [];

  async create(edit: BuiltinNodeEdit) {
    if (this.rows.some((r) => r.tenantId === edit.tenantId && r.type === edit.type && r.version === edit.version)) return false;
    this.rows.push(structuredClone(edit));
    return true;
  }
  async latest(tenantId: string, type: string) {
    return (await this.history(tenantId, type))[0] ?? null;
  }
  async latestAll(tenantId: string) {
    const types = [...new Set(this.rows.filter((r) => r.tenantId === tenantId).map((r) => r.type))];
    return Promise.all(types.map(async (t) => (await this.latest(tenantId, t))!));
  }
  async find(tenantId: string, type: string, version: number) {
    return structuredClone(this.rows.find((r) => r.tenantId === tenantId && r.type === type && r.version === version) ?? null);
  }
  async history(tenantId: string, type: string) {
    return structuredClone(this.rows.filter((r) => r.tenantId === tenantId && r.type === type).sort((a, b) => b.version - a.version));
  }
}
