import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotFoundError, ValidationFailedError } from '../../../shared/domain/errors';
import { CourierNotConnectedError } from '../domain/courier-provider';
import { decryptSecret, encryptSecret } from '../../../shared/security/encryption';
import { CourierIntegrationDoc } from '../infrastructure/persistence/courier-integration.schema';
import { COURIER_INTEGRATION_SPECS } from '../infrastructure/integrations/courier-integration-specs';
import { RealCourierFactory } from '../infrastructure/integrations/real-courier.factory';
import { COURIER_PROFILES } from '../infrastructure/providers/courier-profiles.constants';
import { BASE_URL_FIELD, INTEGRATION_CACHE_MS, INTEGRATION_ENVS, INTEGRATION_MODES, REAL_OPERATION_TIMEOUT_MS } from '../domain/courier-integration.constants';
import { baseUrlOf, envOf, maskSecret, missingFields } from '../domain/courier-integration';
import type {
  CourierCredentials,
  CourierIntegrationSpec,
  CourierIntegrationView,
  IntegrationEnv,
  IntegrationMode,
  IntegrationTestResult,
  IntegrationUpdate,
  StoredCourierIntegration,
} from '../domain/courier-integration.types';

const EMPTY = (code: string): StoredCourierIntegration => ({ code, mode: 'simulated', settings: { sandbox: {}, live: {} }, lastTest: {}, updatedAt: new Date(0), updatedBy: null });

/**
 * Each courier's API connection (platform-wide): which mode it runs in — the simulation, or its
 * sandbox or live account — and each environment's settings. Secret settings are encrypted at rest
 * and never leave the server; the Couriers page only learns whether they are set.
 */
@Injectable()
export class CourierIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(CourierIntegrationService.name);
  private readonly cache = new Map<string, { at: number; value: StoredCourierIntegration }>();

  constructor(
    @InjectModel(CourierIntegrationDoc.name) private readonly model: Model<CourierIntegrationDoc>,
    private readonly real: RealCourierFactory,
  ) {}

  async onModuleInit() {
    // Loaded up front so modeOf() (used for timeouts) is right from the first call.
    await this.loadAll().catch((error: Error) => this.logger.warn(`Could not load courier integrations: ${error.message}`));
  }

  private spec(code: string): CourierIntegrationSpec {
    const spec = COURIER_INTEGRATION_SPECS[code];
    if (!spec) throw new NotFoundError('Courier API integration', code);
    return spec;
  }

  private async loadAll() {
    const docs = await this.model.find().lean();
    for (const doc of docs) this.remember(this.fromDoc(doc));
  }

  private fromDoc(doc: CourierIntegrationDoc): StoredCourierIntegration {
    return {
      code: doc._id,
      mode: doc.mode,
      settings: { sandbox: doc.settings?.sandbox ?? {}, live: doc.settings?.live ?? {} },
      lastTest: (doc.lastTest ?? {}) as StoredCourierIntegration['lastTest'],
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
    };
  }

  private remember(value: StoredCourierIntegration) {
    this.cache.set(value.code, { at: Date.now(), value });
  }

  private async stored(code: string): Promise<StoredCourierIntegration> {
    const hit = this.cache.get(code);
    if (hit && Date.now() - hit.at < INTEGRATION_CACHE_MS) return hit.value;
    const doc = await this.model.findById(code).lean();
    const value = doc ? this.fromDoc(doc) : EMPTY(code);
    this.remember(value);
    return value;
  }

  /** The mode this process last saw (for timeouts); the simulation until settings are saved. */
  modeOf(code: string): IntegrationMode {
    return this.cache.get(code)?.value.mode ?? 'simulated';
  }

  /** One environment's settings with secrets decrypted, for building an adapter. */
  private plain(code: string, stored: StoredCourierIntegration, env: IntegrationEnv): Record<string, string> {
    const spec = this.spec(code);
    const values = stored.settings[env] ?? {};
    return Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, spec.fields.find((f) => f.key === key)?.secret ? decryptSecret(value) : value]),
    );
  }

  private credentials(code: string, stored: StoredCourierIntegration, env: IntegrationEnv): CourierCredentials {
    const values = this.plain(code, stored, env);
    return { env, baseUrl: baseUrlOf(this.spec(code), env, values), values };
  }

  /** The settings real calls use now, or null while the courier runs on the simulation. */
  async activeCredentials(code: string): Promise<CourierCredentials | null> {
    if (!COURIER_INTEGRATION_SPECS[code]) return null;
    const stored = await this.stored(code);
    const env = envOf(stored.mode);
    return env ? this.credentials(code, stored, env) : null;
  }

  /** One environment's settings for a call that asks for it, or why they can't be used. */
  async credentialsFor(code: string, env: IntegrationEnv): Promise<CourierCredentials> {
    const spec = COURIER_INTEGRATION_SPECS[code];
    const name = COURIER_PROFILES.find((p) => p.code === code)?.name ?? code;
    if (!spec || !this.real.has(code)) throw new CourierNotConnectedError(code, `${name} has no API connection`);
    const stored = await this.stored(code);
    const missing = missingFields(spec, this.plain(code, stored, env));
    if (missing.length) throw new CourierNotConnectedError(code, `${name}'s ${env} account isn't set up on the Couriers page (missing ${missing.join(', ')})`);
    return this.credentials(code, stored, env);
  }

  async view(code: string): Promise<CourierIntegrationView> {
    const spec = this.spec(code);
    const stored = await this.stored(code);
    const envs = Object.fromEntries(
      INTEGRATION_ENVS.map((env) => {
        const values = stored.settings[env] ?? {};
        const plain = this.plain(code, stored, env);
        const missing = missingFields(spec, plain);
        return [
          env,
          {
            baseUrl: baseUrlOf(spec, env, plain),
            fields: spec.fields.map((f) => ({
              ...f,
              // The base URL field shows this environment's own default host.
              ...(f.key === BASE_URL_FIELD ? { placeholder: spec.baseUrls[env], help: `Leave empty for ${spec.baseUrls[env]}. Set it when your API document gives another host.` } : {}),
              set: !!values[f.key],
              value: values[f.key] ? (f.secret ? maskSecret(plain[f.key]) : values[f.key]) : null,
            })),
            ready: missing.length === 0,
            missing,
            lastTest: stored.lastTest[env] ?? null,
          },
        ];
      }),
    ) as CourierIntegrationView['envs'];
    return {
      mode: stored.mode,
      docsUrl: spec.docsUrl ?? null,
      testDescription: spec.testDescription,
      rates: spec.rates,
      envs,
      updatedAt: stored.updatedAt.getTime() ? stored.updatedAt.toISOString() : null,
    };
  }

  /** Couriers that have a real API adapter, with their connection. */
  async views(): Promise<Record<string, CourierIntegrationView>> {
    const codes = Object.keys(COURIER_INTEGRATION_SPECS);
    return Object.fromEntries(await Promise.all(codes.map(async (code) => [code, await this.view(code)] as const)));
  }

  /**
   * Saves a mode and/or one environment's settings. A secret sent as '' is kept as it was (the page
   * never has it); null clears a setting. A sandbox or live mode needs that environment's required settings.
   */
  async update(code: string, input: IntegrationUpdate, userId: string | null): Promise<CourierIntegrationView> {
    const spec = this.spec(code);
    const stored = structuredClone(await this.stored(code));
    const issues: string[] = [];

    if (input.values) {
      if (!input.env || !INTEGRATION_ENVS.includes(input.env)) issues.push('Say which environment the settings are for: sandbox or live');
      else {
        const target = stored.settings[input.env];
        for (const [key, raw] of Object.entries(input.values)) {
          const field = spec.fields.find((f) => f.key === key);
          if (!field) {
            issues.push(`Unknown setting “${key}”`);
            continue;
          }
          const value = typeof raw === 'string' ? raw.trim() : null;
          if (value === null || (value === '' && !field.secret)) delete target[key];
          else if (value !== '') target[key] = field.secret ? encryptSecret(value) : value;
        }
        // New settings make the last test result stale.
        delete stored.lastTest[input.env];
      }
    }
    if (input.mode !== undefined) {
      if (!INTEGRATION_MODES.includes(input.mode)) issues.push(`Mode must be one of ${INTEGRATION_MODES.join(', ')}`);
      else stored.mode = input.mode;
    }
    const env = envOf(stored.mode);
    if (env && !this.real.has(code)) issues.push(`${code} has no API adapter yet`);
    if (env && !issues.length) {
      const missing = missingFields(spec, this.plain(code, stored, env));
      if (missing.length) issues.push(`To use the ${env} account, fill in its ${missing.join(', ')}`);
    }
    if (issues.length) throw new ValidationFailedError(issues.map((message) => ({ message })));

    stored.updatedAt = new Date();
    stored.updatedBy = userId;
    await this.model.replaceOne(
      { _id: code },
      { mode: stored.mode, settings: stored.settings, lastTest: stored.lastTest, updatedAt: stored.updatedAt, updatedBy: stored.updatedBy },
      { upsert: true },
    );
    this.remember(stored);
    return this.view(code);
  }

  /** Signs in to the courier with one environment's settings and makes a harmless call; the result is kept. */
  async test(code: string, env: IntegrationEnv): Promise<IntegrationTestResult> {
    const spec = this.spec(code);
    if (!INTEGRATION_ENVS.includes(env)) throw new ValidationFailedError([{ message: 'Test the sandbox or the live account' }]);
    const stored = await this.stored(code);
    const started = Date.now();
    const finish = (ok: boolean, message: string): IntegrationTestResult => ({ ok, message, at: new Date().toISOString(), durationMs: Date.now() - started });
    let result: IntegrationTestResult;
    const missing = missingFields(spec, this.plain(code, stored, env));
    if (missing.length) result = finish(false, `Fill in ${missing.join(', ')} first`);
    else {
      const profile = COURIER_PROFILES.find((p) => p.code === code)!;
      const adapter = this.real.create(code, profile.name, this.credentials(code, stored, env), profile.rateCard);
      try {
        result = finish(true, await withTimeout(adapter.testConnection(), REAL_OPERATION_TIMEOUT_MS));
      } catch (error) {
        result = finish(false, (error as Error).message);
      }
    }
    await this.model.updateOne({ _id: code }, { $set: { [`lastTest.${env}`]: result } });
    const hit = this.cache.get(code);
    if (hit) hit.value.lastTest[env] = result;
    return result;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer within ${ms / 1000} s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
