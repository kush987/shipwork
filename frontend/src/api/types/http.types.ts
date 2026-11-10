// Shapes used by the control-plane transport (src/api/http.ts).
import type { ValidationError } from './common.types';

export interface RequestOptions {
  /** Send the active workspace as `x-tenant-id` (default true). User-level and public calls don't. */
  tenant?: boolean;
  /**
   * Send the session token (default true). Off for sign-in / sign-up, which also don't treat a
   * 401 as "signed out" (it means wrong credentials there).
   */
  auth?: boolean;
  /**
   * A 401 here means something other than "session expired" (e.g. a wrong current password), so
   * it must not sign the user out.
   */
  keepSessionOn401?: boolean;
}

/** Body of a failed control-plane response: a message (or several) and validation errors. */
export interface ErrorBody {
  message?: string | string[];
  errors?: ValidationError[];
}
