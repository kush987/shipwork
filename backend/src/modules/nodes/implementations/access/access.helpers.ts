import { renderTemplate, renderTyped } from '../../../../shared/util/path';
import { asStringArray } from '../../domain/node-config';
import type { NodeExecutionContext } from '../../domain/workflow-node.types';

/** A text setting with {{placeholders}} filled in. */
export const textSetting = (ctx: NodeExecutionContext, key: string) => renderTemplate(String(ctx.config[key] ?? ''), ctx.data).trim();

/** A roles setting: a placeholder for a list (`{{request.auth.roles}}`) or comma-separated names. */
export const rolesSetting = (ctx: NodeExecutionContext, key: string) => asStringArray(renderTyped(String(ctx.config[key] ?? ''), ctx.data));

/** True for a setting that is exactly one {{placeholder}} (its value comes from data at run time). */
export const isPlaceholder = (value: unknown) => typeof value === 'string' && /^\{\{[^{}]+\}\}$/.test(value.trim());
