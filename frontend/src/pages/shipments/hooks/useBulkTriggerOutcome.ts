import { useState } from 'react';
import type { BulkTriggerResult } from '../../../api/types';
import { useToast } from '../../../components/useToast';
import { pluralize } from '../../../lib/format';
import { useShipmentSaved } from './useShipmentSaved';

/**
 * What follows a bulk trigger, with or without an assigned courier: refresh, clear the selection,
 * then a success toast, or the per-shipment results when any failed.
 */
export function useBulkTriggerOutcome(clearSelection: () => void) {
  const [bulkResult, setBulkResult] = useState<BulkTriggerResult | null>(null);
  const saved = useShipmentSaved();
  const toast = useToast();

  /** @param verb how the toast describes what happened, e.g. "Triggered". */
  const report = (result: BulkTriggerResult, verb: string) => {
    saved();
    clearSelection();
    if (result.failed) setBulkResult(result);
    else toast.success(`${verb} ${pluralize(result.succeeded, 'shipment')}`, 'Each one is now on its journey.');
  };

  return { bulkResult, dismiss: () => setBulkResult(null), report };
}
