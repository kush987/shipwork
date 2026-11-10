import { FilterX, ListFilter, Plus, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui';
import { DIR_WORDS, OPERATORS } from './list.constants';
import { isIncomplete, newCondition } from './list.helpers';
import type { Condition, ConditionsPanelProps, ListField, ListToolbarProps, SortDir } from './list.types';
import './list.css';

/**
 * Above a list: search, a select per quick filter, "Filter" for conditions on any column, the order
 * (a menu on phones, where headers are out of reach), how many rows show, and Clear.
 */
export function ListToolbar<T>({ list, children, sortMenu }: ListToolbarProps<T>) {
  const { config, state } = list;
  const [open, setOpen] = useState(state.conditions.length > 0);
  const quick = config.fields.filter((f) => f.quick && f.options);
  const sortable = config.fields.filter((f) => f.sortable !== false);
  const complete = state.conditions.filter((c) => !isIncomplete(c, config.fields.find((f) => f.key === c.field) as ListField<unknown>)).length;
  const [one, many] = config.noun;
  const shown = list.rows.length;

  // The panel shows while it is open and has conditions (Clear, or removing the last one, closes it).
  const showing = open && state.conditions.length > 0;
  const toggleConditions = () => {
    if (!showing && state.conditions.length === 0) list.setConditions([newCondition(config.fields.find((f) => f.filterable !== false)!)]);
    setOpen(!showing);
  };

  return (
    <div className="list-toolbar">
      <div className="list-toolbar-row">
        <label className="search list-search">
          <Search size={15} />
          <input type="search" placeholder={config.searchPlaceholder} aria-label={config.searchPlaceholder} value={state.q} onChange={(e) => list.setSearch(e.target.value)} />
        </label>
        {quick.map((f) => (
          <select
            key={f.key}
            className={`input list-select${state.quick[f.key] ? ' is-set' : ''}`}
            aria-label={f.label}
            value={state.quick[f.key] ?? ''}
            onChange={(e) => list.setQuick(f.key, e.target.value)}
          >
            <option value="">{f.label}: all</option>
            {f.options!.map((o) => (
              <option key={o.value} value={o.value}>
                {f.label}: {o.label}
              </option>
            ))}
          </select>
        ))}
        <Button icon={ListFilter} onClick={toggleConditions} aria-expanded={showing} className={complete ? 'list-filter-on' : undefined}>
          Filter{complete ? ` · ${complete}` : ''}
        </Button>
        <select
          className={`input list-select list-sort-select${sortMenu ? ' is-always' : ''}`}
          aria-label="Sort by"
          value={state.sort ? `${state.sort.key}:${state.sort.dir}` : ''}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':');
            list.setSort(key ? { key, dir: dir as SortDir } : null);
          }}
        >
          {!config.defaultSort && <option value="">Sort: as listed</option>}
          {sortable.flatMap((f) =>
            (['asc', 'desc'] as const).map((dir) => (
              <option key={`${f.key}:${dir}`} value={`${f.key}:${dir}`}>
                Sort: {f.label} ({DIR_WORDS[f.kind][dir]})
              </option>
            )),
          )}
        </select>
        {children}
        <span className="list-count muted small" aria-live="polite">
          {list.filtering ? `${shown} of ${list.total} ${list.total === 1 ? one : many}` : `${list.total} ${list.total === 1 ? one : many}`}
        </span>
        {list.filtering && (
          <button type="button" className="link-inline list-clear" onClick={list.clear}>
            <FilterX size={14} /> Clear
          </button>
        )}
      </div>
      {showing && <ConditionsPanel list={list} />}
    </div>
  );
}

/** "Show rows that match all/any of these conditions", one `<column> <operator> <value>` per row. */
function ConditionsPanel<T>({ list }: ConditionsPanelProps<T>) {
  const { config, state } = list;
  const fields = config.fields.filter((f) => f.filterable !== false);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const set = (i: number, next: Condition) => list.setConditions(state.conditions.map((c, j) => (j === i ? next : c)));
  const remove = (i: number) => list.setConditions(state.conditions.filter((_, j) => j !== i));

  return (
    <div className="list-conditions" role="group" aria-label="Filter conditions">
      <div className="list-conditions-head small">
        Show {config.noun[1]} that match
        <select className="input list-match" aria-label="Match" value={state.match} onChange={(e) => list.setMatch(e.target.value as 'all' | 'any')}>
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        of these conditions
      </div>
      {state.conditions.map((c, i) => {
        const field = byKey.get(c.field) ?? fields[0];
        const op = OPERATORS[field.kind].find((o) => o.op === c.op) ?? OPERATORS[field.kind][0];
        return (
          <div className="list-condition" key={i}>
            <select
              className="input"
              aria-label="Column"
              value={field.key}
              onChange={(e) => set(i, newCondition(byKey.get(e.target.value)!))}
            >
              {fields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select className="input" aria-label="Condition" value={op.op} onChange={(e) => set(i, { ...c, op: e.target.value as Condition['op'] })}>
              {OPERATORS[field.kind].map((o) => (
                <option key={o.op} value={o.op}>
                  {o.label}
                </option>
              ))}
            </select>
            {op.needsValue ? <ValueInput field={field} condition={c} onChange={(value) => set(i, { ...c, value })} /> : <span className="list-condition-novalue" />}
            <button type="button" className="icon-btn" aria-label="Remove condition" onClick={() => remove(i)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
      <div>
        <Button size="sm" icon={Plus} onClick={() => list.setConditions([...state.conditions, newCondition(fields[0])])}>
          Add condition
        </Button>
      </div>
    </div>
  );
}

function ValueInput<T>({ field, condition, onChange }: { field: ListField<T>; condition: Condition; onChange: (value: string) => void }) {
  if (field.kind === 'enum') {
    return (
      <select className="input" aria-label="Value" value={condition.value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose…</option>
        {field.options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'date' && condition.op !== 'within_days') {
    return <input className="input" type="date" aria-label="Date" value={condition.value} onChange={(e) => onChange(e.target.value)} />;
  }
  const numeric = field.kind === 'number' || condition.op === 'within_days';
  return (
    <input
      className="input"
      type={numeric ? 'number' : 'text'}
      inputMode={numeric ? 'decimal' : undefined}
      min={condition.op === 'within_days' ? 0 : undefined}
      aria-label="Value"
      placeholder={condition.op === 'within_days' ? 'days, e.g. 7' : 'Value'}
      value={condition.value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
