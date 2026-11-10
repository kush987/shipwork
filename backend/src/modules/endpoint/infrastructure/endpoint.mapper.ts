import { fromDocument, toDocument } from '../../../shared/persistence/mongo-mapping';
import type { ApiEndpoint } from '../domain/api-endpoint.types';
import type { EndpointDoc } from './endpoint.schema';

export const toEndpoint = (doc: EndpointDoc): ApiEndpoint => fromDocument<ApiEndpoint>(doc as never);
export const toEndpointDoc = (endpoint: ApiEndpoint) => toDocument(endpoint);
