import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { OutboundHttp } from '../../../../shared/http/outbound-http';
import type { RealCourierProvider } from '../../domain/courier-provider.types';
import type { CourierCredentials } from '../../domain/courier-integration.types';
import type { RateCard } from '../../domain/rate-calculator.types';
import { BluedartProvider } from './bluedart/bluedart.provider';
import { DelhiveryProvider } from './delhivery/delhivery.provider';
import { EkartProvider } from './ekart/ekart.provider';
import { XpressbeesProvider } from './xpressbees/xpressbees.provider';

type Adapter = new (code: string, name: string, http: OutboundHttp, credentials: CourierCredentials, rateCard: RateCard) => RealCourierProvider;

const ADAPTERS: Record<string, Adapter> = {
  delhivery: DelhiveryProvider,
  xpressbees: XpressbeesProvider,
  bluedart: BluedartProvider,
  ekart: EkartProvider,
};

/**
 * Builds the real adapter for a courier and one environment's settings. Adapters are reused while the
 * settings stay the same, so sign-in tokens are kept between calls.
 */
@Injectable()
export class RealCourierFactory {
  /** One adapter per courier and environment, rebuilt when its settings change. */
  private readonly built = new Map<string, { settings: string; adapter: RealCourierProvider }>();

  constructor(private readonly http: OutboundHttp) {}

  has(code: string) {
    return code in ADAPTERS;
  }

  create(code: string, name: string, credentials: CourierCredentials, rateCard: RateCard): RealCourierProvider {
    const Adapter = ADAPTERS[code];
    if (!Adapter) throw new Error(`No API adapter for courier ${code}`);
    const slot = `${code}:${credentials.env}`;
    const settings = createHash('sha256').update(JSON.stringify([credentials, rateCard])).digest('hex');
    const current = this.built.get(slot);
    if (current?.settings === settings) return current.adapter;
    const adapter = new Adapter(code, name, this.http, credentials, rateCard);
    this.built.set(slot, { settings, adapter });
    return adapter;
  }
}
