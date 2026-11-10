import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomNodeDoc, CustomNodeVersionDoc } from './custom-node.schema';
import { CustomNode, CustomNodeVersion } from '../domain/custom-node.types';
import { CustomNodeRepository } from '../domain/custom-node.repository';
import { toCustomNode, toCustomNodeVersion, toCustomNodeVersionDoc } from './custom-node.mapper';
import { SIMPLE_SPEC_KEYS } from '../domain/custom-node.constants';

@Injectable()
export class MongoCustomNodeRepository extends CustomNodeRepository {
  constructor(
    @InjectModel(CustomNodeDoc.name) private readonly nodes: Model<CustomNodeDoc>,
    @InjectModel(CustomNodeVersionDoc.name) private readonly versions: Model<CustomNodeVersionDoc>,
  ) {
    super();
  }

  async create(node: CustomNode, version: CustomNodeVersion) {
    await this.versions.create(toCustomNodeVersionDoc(version));
    const { id, createdAt, updatedAt, ...rest } = node;
    await this.nodes.create({ _id: id, ...rest, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) });
  }

  async saveVersion(node: CustomNode, version: CustomNodeVersion) {
    // Version first: if the pointer update fails, the newer version simply isn't "latest" yet.
    await this.versions.create(toCustomNodeVersionDoc(version));
    const { id, createdAt, updatedAt, ...rest } = node;
    // Format options the new version doesn't have must not linger from an older one.
    const unset = SIMPLE_SPEC_KEYS.filter((key) => rest[key] === undefined);
    await this.nodes.updateOne(
      { _id: id, tenantId: node.tenantId },
      { $set: { ...rest, updatedAt: new Date(updatedAt) }, ...(unset.length ? { $unset: Object.fromEntries(unset.map((key) => [key, 1])) } : {}) },
    );
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.nodes.findOne({ _id: id, tenantId }).lean();
    return doc ? toCustomNode(doc) : null;
  }

  async findByType(tenantId: string, type: string) {
    const doc = await this.nodes.findOne({ tenantId, type }).lean();
    return doc ? toCustomNode(doc) : null;
  }

  async list(tenantId: string, includeArchived: boolean) {
    const docs = await this.nodes
      .find({ tenantId, ...(includeArchived ? {} : { archived: false }) })
      .sort({ label: 1 })
      .lean();
    return docs.map(toCustomNode);
  }

  async setArchived(tenantId: string, id: string, archived: boolean) {
    const doc = await this.nodes
      .findOneAndUpdate({ _id: id, tenantId }, { $set: { archived, updatedAt: new Date() } }, { new: true })
      .lean();
    return doc ? toCustomNode(doc) : null;
  }

  async findVersion(tenantId: string, type: string, version: number) {
    const doc = await this.versions.findOne({ tenantId, type, version }).lean();
    return doc ? toCustomNodeVersion(doc) : null;
  }

  async listVersions(tenantId: string, customNodeId: string) {
    const docs = await this.versions.find({ tenantId, customNodeId }, { code: 0 }).sort({ version: -1 }).lean();
    return docs.map((d) => toCustomNodeVersion({ ...d, code: '' }));
  }
}
