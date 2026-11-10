/** Route metadata keys read by the global auth guard. */
export const IS_PUBLIC = 'auth:public';
export const NO_TENANT = 'auth:no-tenant';
export const AREA = 'auth:area';
export const PERMISSION = 'auth:permission';
export const ANY_MEMBER = 'auth:any-member';
export const PLATFORM_ADMIN_WRITES = 'auth:platform-admin-writes';
export const OPS_ONLY = 'auth:ops-only';

/** Header carrying OPS_TOKEN, for monitoring and autoscalers that can't sign in. */
export const OPS_TOKEN_HEADER = 'x-ops-token';

/** Methods that only read: by default they need `<area>:read`; everything else `<area>:write`. */
export const READ_METHODS = ['GET', 'HEAD', 'OPTIONS'];
