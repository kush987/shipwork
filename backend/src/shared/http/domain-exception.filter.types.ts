import { DomainError } from '../domain/errors';

export type DomainErrorClass = abstract new (...args: never[]) => DomainError;
