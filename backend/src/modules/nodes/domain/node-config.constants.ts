import { DATA_ROOTS } from './workflow-node.constants';

/**
 * Config fields and checks that several node types share. Defining them once keeps labels,
 * help texts and validation rules identical everywhere they appear (DRY).
 */

/** A context key users may name: letter or _, then letters, digits or _. */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;

/** Context keys written by built-in nodes; a user-named result may not overwrite them. */
export const RESERVED_CONTEXT_KEYS = ['serviceableCouriers', 'rates', 'selectedCourier', 'rankedCouriers', 'booking', 'lastHttpResponse'];

export const TEMPLATE_HELP = 'Use {{request.*}}, {{context.*}}, {{trigger.*}} or {{shipment.*}} placeholders';

export const TYPED_JSON_HELP = `${TEMPLATE_HELP}. A value that is exactly "{{path}}" keeps its type (number, object…).`;

export const DATA_ROOTS_TEXT = DATA_ROOTS.map((r) => `${r}.`).join(', ');
