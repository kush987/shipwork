/** Lua twin of gcra.ts. Uses Redis' clock so every replica agrees on "now". */
export const GCRA_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local window = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local emission = window / limit
local stored = redis.call('GET', KEYS[1])
local tat = now
if stored then tat = math.max(tonumber(stored), now) end
local nextTat = tat + emission
local allowAt = nextTat - window
if allowAt > now then
  return {0, 0, math.ceil(tat - now), math.ceil(allowAt - now)}
end
redis.call('SET', KEYS[1], tostring(nextTat), 'PX', math.ceil(nextTat - now))
return {1, math.floor((window - (nextTat - now)) / emission), math.ceil(nextTat - now), 0}
`;

/** Leases are sorted-set members scored by their expiry; expired ones are dropped before counting. */
export const ACQUIRE_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local max = tonumber(ARGV[1])
local lease = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= max then return 0 end
redis.call('ZADD', KEYS[1], now + lease, ARGV[3])
if redis.call('PTTL', KEYS[1]) < lease + 1000 then redis.call('PEXPIRE', KEYS[1], lease + 1000) end
return 1
`;

export const COUNT_SCRIPT = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
`;

/** Prefix of every key these limiters write, so they are easy to find and never clash with BullMQ's. */
export const KEY_PREFIX = 'shipflow:';

/** Log "counting unavailable" at most this often. */
export const DEGRADED_LOG_INTERVAL_MS = 60_000;
