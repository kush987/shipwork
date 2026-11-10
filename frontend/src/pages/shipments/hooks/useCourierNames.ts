import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api } from '../../../api/client';
import { REFERENCE_STALE_MS } from '../shipments.constants';
import type { CourierNameFn } from '../shipments.types';

/** courier code → display name, from the courier registry. */
export function useCourierNames(): CourierNameFn {
  const couriers = useQuery({ queryKey: ['couriers'], queryFn: api.listCouriers, staleTime: REFERENCE_STALE_MS });
  return useMemo(() => {
    const names = new Map((couriers.data ?? []).map((c) => [c.code, c.name]));
    return (code: string | null | undefined) => (code ? (names.get(code) ?? code) : '');
  }, [couriers.data]);
}
