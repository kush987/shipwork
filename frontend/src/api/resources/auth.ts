import { request } from '../http';
import type { AuthSession, LoginInput, Me, PasswordChange, SignupInput } from '../types';

const PUBLIC = { auth: false, tenant: false } as const;
const USER_LEVEL = { tenant: false } as const;

export const authApi = {
  signup: (input: SignupInput) => request<AuthSession>('POST', '/auth/signup', input, PUBLIC),
  login: (input: LoginInput) => request<AuthSession>('POST', '/auth/login', input, PUBLIC),
  logout: () => request<void>('POST', '/auth/logout', undefined, USER_LEVEL),
  me: () => request<Me>('GET', '/auth/me', undefined, USER_LEVEL),
  // 401 here means a wrong current password, not an ended session.
  changePassword: (input: PasswordChange) => request<void>('POST', '/auth/password', input, { ...USER_LEVEL, keepSessionOn401: true }),
};
