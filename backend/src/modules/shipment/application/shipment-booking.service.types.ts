import { CircuitState } from '../../courier/domain/circuit-breaker.types';
import { RateQuote } from '../../courier/domain/courier-provider.types';

export interface CourierOption {
  courierCode: string;
  courierName: string;
  enabled: boolean;
  circuit: CircuitState;
  serviceable: boolean;
  reason: string | null;
  quote: RateQuote | null;
  current: boolean;
}
