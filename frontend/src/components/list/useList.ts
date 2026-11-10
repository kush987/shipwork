import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { applyList, isFiltering, nextSort, readState, writeState } from './list.helpers';
import type { ListConfig, ListControls, ListStateChange } from './list.types';

/**
 * Search, sort and filters for a list shown in the browser, kept in the URL so they survive opening a
 * row and coming back, and can be shared. `config` must be stable (a constant or memoised).
 */
export function useList<T>(rows: T[] | undefined, config: ListConfig<T>): ListControls<T> {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readState(params, config), [params, config]);
  const visible = useMemo(() => applyList(rows ?? [], config, state), [rows, config, state]);

  const change = useCallback(
    (part: ListStateChange) => setParams((prev) => writeState(prev, config, part), { replace: true }),
    [setParams, config],
  );

  return {
    config,
    state,
    rows: visible,
    total: rows?.length ?? 0,
    filtering: isFiltering(state, config as ListConfig<unknown>),
    setSearch: (q) => change({ q }),
    toggleSort: (key) => change({ sort: nextSort(config, state.sort, key) }),
    setSort: (sort) => change({ sort }),
    setQuick: (key, value) => change({ quick: { [key]: value } }),
    setConditions: (conditions) => change({ conditions }),
    setMatch: (match) => change({ match }),
    clear: () => change({ q: '', conditions: [], match: 'all', quick: Object.fromEntries(Object.keys(state.quick).map((k) => [k, ''])) }),
  };
}
