import { IsArray, IsBoolean, IsDefined, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** A change written as MongoDB does: {"$set": …, "$inc": …, "$push": …} (or plain fields to set). */
export class ChangeRecordDto {
  @IsObject() update: Record<string, unknown>;
  /** Only change it when it also matches this filter; otherwise 409 and nothing changes. */
  @IsOptional() @IsObject() onlyIf?: Record<string, unknown>;
}

/** Change the newest record whose `findBy` field equals `value`, or create it when there is none. */
export class UpsertRecordDto {
  @IsString() @MaxLength(200) findBy: string;
  @IsDefined() value: unknown;
  @IsObject() update: Record<string, unknown>;
}

export class ManyRecordsDto {
  @IsOptional() @IsObject() filter?: Record<string, unknown>;
  /** Needed (true) to act on every record when there is no filter. */
  @IsOptional() @IsBoolean() all?: boolean;
}

export class UpdateManyDto extends ManyRecordsDto {
  @IsObject() update: Record<string, unknown>;
}

export class AggregateDto {
  /** MongoDB pipeline stages, e.g. [{"$match": …}, {"$group": …}]. */
  @IsArray() pipeline: Record<string, unknown>[];
}

export class TransactionDto {
  /** [{"op": "insert" | "update" | "delete", "collection": …, "as"?: …, …}] — all commit, or none does. */
  @IsArray() operations: Record<string, unknown>[];
}
