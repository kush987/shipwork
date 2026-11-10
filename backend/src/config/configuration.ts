import { availableParallelism } from 'node:os';
import { AppRole } from './configuration.types';

const list = (value: string | undefined) => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

const int = (value: string | undefined, fallback: number) => {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const appConfig = () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI ?? 'mongodb://localhost:27027/shipflow',
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6389', 10),
    // Managed Redis (e.g. Azure Managed Redis) needs an access key and TLS; local Redis needs neither.
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? { servername: process.env.REDIS_HOST } : undefined,
  },
  role: (process.env.APP_ROLE ?? 'all') as AppRole,
  workerConcurrency: int(process.env.WORKER_CONCURRENCY, 10),
  /** Domain events (shipment.*, custom.*) a worker turns into workflow runs at the same time. */
  eventConcurrency: int(process.env.EVENT_CONCURRENCY, 20),
  /**
   * Background threads that run user code (Run code steps, custom nodes), so a slow script never
   * blocks the process. 0 runs it on the main thread (tests, tiny deployments).
   */
  sandboxThreads: int(process.env.SANDBOX_THREADS, Math.max(1, Math.min(4, availableParallelism() - 1))),
  auth: {
    /** Anyone may create an account and workspace (false: only owners add people). */
    allowSignup: process.env.ALLOW_SIGNUP !== 'false',
    /** May change platform-wide settings (couriers). Comma-separated emails. */
    platformAdmins: list(process.env.PLATFORM_ADMIN_EMAILS).map((e) => e.toLowerCase()),
    /** Lets monitoring read GET /api/health/load with `x-ops-token` (unset: platform admins only). */
    opsToken: process.env.OPS_TOKEN ?? '',
  },
  /**
   * Browser origins allowed to call the builder APIs (the frontend). Endpoint calls
   * (/api/run/*) accept any origin — they are meant to be called from customers' apps.
   */
  corsOrigins: list(process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'),
  /**
   * Where ShipFlow creates managed workspace databases (`sfb_<workspace>`): business data such as
   * shipments, warehouses and records. Defaults to the platform's own server; point it at a
   * separate cluster to keep business data apart physically.
   */
  businessMongoUri: process.env.BUSINESS_MONGO_URI ?? process.env.MONGO_URI ?? 'mongodb://localhost:27027/shipflow',
  /** Base64 32-byte key encrypting stored connection strings of workspace-owned databases. */
  dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY ?? '',
  /** Let workspaces connect databases on private/loopback addresses (local development only). */
  allowPrivateDbHosts: process.env.ALLOW_PRIVATE_DB_HOSTS === 'true',
  /** Body size the HTTP API accepts (endpoint calls included); bigger requests get 413. */
  maxRequestBodyKb: int(process.env.MAX_REQUEST_BODY_KB, 1024),
  /** Behind a load balancer / proxy: trust X-Forwarded-For so per-IP limits see the real client. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /**
   * Limits on the runtime gateway (calls per minute; 0 turns a rule off). They protect the
   * platform and every tenant from one noisy tenant or caller. Counted in Redis, so they hold
   * across all runtime replicas.
   */
  rateLimits: {
    /** All calls to one tenant's endpoints together. */
    tenantPerMinute: int(process.env.RATE_LIMIT_TENANT_PER_MINUTE, 6_000),
    /** One API key, across the tenant's endpoints. */
    apiKeyPerMinute: int(process.env.RATE_LIMIT_API_KEY_PER_MINUTE, 1_200),
    /** One client IP calling public (no-auth) endpoints. */
    ipPerMinute: int(process.env.RATE_LIMIT_IP_PER_MINUTE, 300),
    /** Synchronous calls of one tenant running at the same moment (each holds a runtime slot). */
    tenantConcurrentSync: int(process.env.TENANT_MAX_CONCURRENT_SYNC, 50),
  },
  /** Fair sharing of the queue workers between tenants. */
  fairness: {
    /** Workflow steps of one tenant running at the same moment across all workers (0 = no cap). */
    tenantMaxActiveSteps: int(process.env.TENANT_MAX_ACTIVE_STEPS, 20),
  },
  /** How long run history is kept; MongoDB deletes older runs and their steps automatically. */
  retention: {
    /** Runs started by API endpoints, and test runs: high volume, short-lived interest. */
    apiDays: int(process.env.EXECUTION_RETENTION_API_DAYS, 7),
    /** Everything else: event, schedule, replay and manual runs. */
    defaultDays: int(process.env.EXECUTION_RETENTION_DAYS, 30),
  },
  /** The builder audit log (changes and denied attempts per workspace). */
  audit: {
    /** Days entries are kept; MongoDB deletes older ones. */
    retentionDays: int(process.env.AUDIT_RETENTION_DAYS, 365),
  },
  webhookSecret: process.env.WEBHOOK_SECRET ?? '',
  /** Let workflow HTTP steps call localhost/private IPs (local development only). Metadata IPs stay blocked. */
  httpAllowPrivateNetworks: process.env.HTTP_ALLOW_PRIVATE_NETWORKS === 'true',
});

export const config = appConfig();

export const runsWorker = () => config.role === 'worker' || config.role === 'all';

export const runsHttp = () => config.role !== 'worker';
