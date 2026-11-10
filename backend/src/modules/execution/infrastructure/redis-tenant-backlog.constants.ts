/** +1 for the tenant, and keep the counter alive while it is in use. */
export const ENQUEUED_SCRIPT = `
local v = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return v
`;

/** -1 for the tenant, only the first time this job starts; never below zero (the key is removed at 0). */
export const STARTED_SCRIPT = `
if redis.call('SET', KEYS[2], '1', 'NX', 'PX', ARGV[2]) then
  local v = redis.call('DECR', KEYS[1])
  if v <= 0 then redis.call('DEL', KEYS[1]) else redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
end
return 1
`;

export const BACKLOG_KEY = 'backlog:';
export const STARTED_KEY = 'backlog-started:';
