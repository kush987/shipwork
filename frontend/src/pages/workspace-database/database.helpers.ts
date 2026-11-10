import { sumBy } from 'lodash-es';
import type { BusinessCollection } from '../../api/types';
import type { SwitchTarget } from './database.types';
import { pluralize } from '../../lib/format';
import { MONGO_SCHEME, MONGO_URI } from './database.constants';

/** Why a connection string can't be used yet (first problem only), or undefined. */
export function connectionStringProblem(uri: string): string | undefined {
  const value = uri.trim();
  if (!value) return 'Paste a connection string';
  if (!MONGO_SCHEME.test(value)) return 'Use a mongodb:// or mongodb+srv:// connection string';
  if (!MONGO_URI.test(value)) return 'Add the database name after the host, e.g. …mongodb.net/acme';
  return undefined;
}

export const totalDocuments = (collections: BusinessCollection[]) => sumBy(collections, (c) => c.documents);

/** What happens to the current data when switching, in one sentence. */
export function copySummary(copyData: boolean, documents: number, currentDatabase: string): string {
  if (copyData) {
    return documents
      ? `The workspace's ${pluralize(documents, 'document')} will be copied from ${currentDatabase} first.`
      : 'There is no business data to copy yet.';
  }
  return documents
    ? `Nothing is copied: the ${pluralize(documents, 'document')} in ${currentDatabase} stay there and won't show here until you switch back.`
    : 'Nothing is copied.';
}

export const switchTitle = (target: SwitchTarget) =>
  target.kind === 'external' ? `Store business data in ${target.databaseName}?` : 'Switch back to the ShipFlow-managed database?';
