import { Injectable } from '@nestjs/common';
import { NonRetryableError } from '../../../../shared/domain/errors';
import { parseJsonObject } from '../../../../shared/util/json-setting';
import { DEFAULT_SORT } from '../../../../shared/query/record-query.constants';
import { dataSourceField, saveAsField, saveAsKey } from '../../domain/node-config';
import { FAILED_OUTPUT } from '../../domain/workflow-node.constants';
import { DataNode, joinsField, LIST_JSON_SETTINGS, recordFieldsField, recordFilterField, recordSortField } from './data-node.base';
import { cursorOrder, pageByCursor, pageByNumber } from '../../../data/application/record-pager';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PAGINATION_MODES } from '../../../data/domain/record-page.constants';
import type { PaginationMode } from '../../../data/domain/record-page.types';
import type { SortKey } from '../../../../shared/query/record-query.types';
import type { ConfigField, NodeExecutionContext, NodeExecutionResult } from '../../domain/workflow-node.types';

const inMode = (mode: PaginationMode) => ({ key: 'mode', values: [mode] });

const modeField: ConfigField = {
  key: 'mode',
  label: 'Pagination',
  kind: 'select',
  options: [
    { value: 'pages', label: 'Page numbers' },
    { value: 'cursor', label: 'Infinite scroll (cursor)' },
  ],
  default: 'pages',
  required: true,
  help: 'Page numbers: ?page=2, with totals for a pager. Infinite scroll: ?cursor=<nextCursor> for the next batch — nothing repeats while records are added.',
};

/** A client-supplied number shown back in an error, kept short. */
const shown = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

/**
 * One page of a list plus what the client needs to ask for the next: numbered pages with totals, or a
 * cursor for infinite scroll. A bad page or cursor from the caller takes the Failed path (connect it to
 * a 400 response) instead of failing the run.
 */
@Injectable()
export class DataPaginateNode extends DataNode {
  protected readonly readsBuiltIn = true;
  protected readonly jsonSettings = LIST_JSON_SETTINGS;

  readonly definition = {
    type: 'data.paginate',
    category: 'data' as const,
    label: 'Paginated list',
    description: 'Returns one page of records: numbered pages with totals, or a cursor for infinite scroll. Saves { items, pagination }.',
    icon: 'list-ordered',
    configSchema: [
      dataSourceField,
      modeField,
      recordFilterField,
      { ...recordSortField, help: 'Infinite scroll orders by one field, ties going by id, e.g. {"createdAt": -1}.' },
      {
        key: 'pageSize',
        label: 'Page size',
        kind: 'text' as const,
        default: '{{request.query.pageSize}}',
        help: `Records per page. Empty → ${DEFAULT_PAGE_SIZE}; more than ${MAX_PAGE_SIZE} gives ${MAX_PAGE_SIZE}.`,
      },
      { key: 'page', label: 'Page', kind: 'text' as const, default: '{{request.query.page}}', visibleWhen: inMode('pages'), help: 'Which page, from 1. Empty → 1.' },
      {
        key: 'cursor',
        label: 'Cursor',
        kind: 'text' as const,
        default: '{{request.query.cursor}}',
        visibleWhen: inMode('cursor'),
        help: 'The nextCursor of the previous page. Empty → the first page.',
      },
      recordFieldsField,
      joinsField,
      saveAsField('list', 'Next steps read context.<name>.items and context.<name>.pagination'),
    ],
    outputs: [{ id: 'default', label: 'Done' }, FAILED_OUTPUT],
  };

  validateConfig(config: Record<string, unknown>): string[] {
    const errors = super.validateConfig(config);
    const mode = config.mode ?? 'pages';
    if (!(PAGINATION_MODES as readonly unknown[]).includes(mode)) errors.push('Pagination must be page numbers (pages) or infinite scroll (cursor)');
    if (mode === 'cursor') {
      try {
        const sort = parseJsonObject(config.sort, 'Sort');
        if (sort && Object.keys(sort).length > 1) errors.push('Infinite scroll orders by one field (ties go by id) — keep one key in Sort, e.g. {"createdAt": -1}');
      } catch {
        // Bad JSON is reported by the shared JSON checks.
      }
    }
    return errors;
  }

  protected async run(ctx: NodeExecutionContext, collection: string): Promise<NodeExecutionResult> {
    const filter = this.jsonObject(ctx, 'filter', 'Filter');
    const pageSize = Math.min(this.wholeNumber(ctx, 'pageSize', 'Page size', DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const page =
      ctx.config.mode === 'cursor'
        ? await pageByCursor(this.sources, ctx.tenantId, collection, {
            filter,
            order: this.cursorOrder(ctx, collection),
            cursor: this.text(ctx, 'cursor') || null,
            pageSize,
            fields: this.fieldsToRead(ctx),
          })
        : await pageByNumber(this.sources, ctx.tenantId, collection, {
            filter,
            sort: this.jsonObject(ctx, 'sort', 'Sort'),
            page: this.wholeNumber(ctx, 'page', 'Page', 1),
            pageSize,
            fields: this.fieldsToRead(ctx),
          });
    const { records: items, joins } = await this.withJoins(ctx, page.items);
    const saveAs = saveAsKey(ctx.config, 'list');
    return {
      outputHandle: 'default',
      output: { collection, savedAs: `context.${saveAs}`, count: items.length, pagination: page.pagination, ...(joins.length ? { joins } : {}), items },
      contextPatch: { [saveAs]: { items, pagination: page.pagination } },
    };
  }

  /** A whole number from 1 the caller sent (usually a query parameter); empty → `fallback`. */
  private wholeNumber(ctx: NodeExecutionContext, key: string, label: string, fallback: number): number {
    const text = this.text(ctx, key);
    if (!text) return fallback;
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < 1) throw new NonRetryableError(`${label} must be a whole number from 1 — got “${shown(text)}”`);
    return value;
  }

  /** Infinite scroll's order: the Sort setting's one key, else the source's own default (built-in data may have no createdAt). */
  private cursorOrder(ctx: NodeExecutionContext, collection: string): SortKey {
    const fallback = this.sources.systemSourceInfo(collection)?.defaultSort[0] ?? DEFAULT_SORT[0];
    return cursorOrder(this.jsonObject(ctx, 'sort', 'Sort'), fallback);
  }
}
