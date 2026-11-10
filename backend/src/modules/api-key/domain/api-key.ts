import { generateSecret as newSecret, hashSecret } from '../../../shared/security/secrets';
import { ApiKeyView, ApiKey } from './api-key.types';
import { SECRET_PREFIX } from './api-key.constants';
import { omit } from 'lodash';

export const generateSecret = () => newSecret(SECRET_PREFIX);

export { hashSecret };

export const looksLikeSecret = (value: string) => value.startsWith(SECRET_PREFIX) && value.length >= 20 && value.length <= 200;

export const toApiKeyView = (key: ApiKey): ApiKeyView => ({ ...omit(key, ['tenantId', 'hash', 'revokedAt']), revoked: !!key.revokedAt });
