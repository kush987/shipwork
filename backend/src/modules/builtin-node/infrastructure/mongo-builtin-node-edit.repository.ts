import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BuiltinNodeEditDoc } from './builtin-node-edit.schema';
import { BuiltinNodeEditRepository } from '../domain/builtin-node-edit.repository';
import type { BuiltinNodeEdit } from '../domain/builtin-node-edit.types';

const DUPLICATE_KEY = 11000;

const toEdit = ({ _id, createdAt, ...doc }: BuiltinNodeEditDoc): BuiltinNodeEdit => ({
  ...doc,
  defaults: doc.defaults ?? {},
  createdAt: new Date(createdAt).toISOString(),
});

@Injectable()
export class MongoBuiltinNodeEditRepository extends BuiltinNodeEditRepository {
  constructor(@InjectModel(BuiltinNodeEditDoc.name) private readonly edits: Model<BuiltinNodeEditDoc>) {
    super();
  }

  async create(edit: BuiltinNodeEdit) {
    try {
      await this.edits.create({ ...edit, _id: `${edit.tenantId}:${edit.type}:${edit.version}`, createdAt: new Date(edit.createdAt) });
      return true;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) return false;
      throw error;
    }
  }

  async latest(tenantId: string, type: string) {
    const doc = await this.edits.findOne({ tenantId, type }).sort({ version: -1 }).lean();
    return doc ? toEdit(doc as BuiltinNodeEditDoc) : null;
  }

  async latestAll(tenantId: string) {
    const docs = await this.edits.aggregate<BuiltinNodeEditDoc>([
      { $match: { tenantId } },
      { $sort: { type: 1, version: -1 } },
      { $group: { _id: '$type', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);
    return docs.map(toEdit);
  }

  async find(tenantId: string, type: string, version: number) {
    const doc = await this.edits.findOne({ tenantId, type, version }).lean();
    return doc ? toEdit(doc as BuiltinNodeEditDoc) : null;
  }

  async history(tenantId: string, type: string) {
    return (await this.edits.find({ tenantId, type }).sort({ version: -1 }).lean()).map((d) => toEdit(d as BuiltinNodeEditDoc));
  }
}
