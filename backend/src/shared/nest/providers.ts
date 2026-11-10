import type { InjectionToken, Provider, Type } from '@nestjs/common';

/**
 * Registers each class as a provider and exposes all of them as one array under `token` — the
 * multi-provider pattern used for strategy lists (node types, authenticators, invokers, checkers).
 */
export function providerList(token: InjectionToken, classes: Type[]): Provider[] {
  return [...classes, { provide: token, useFactory: (...instances: unknown[]) => instances, inject: classes }];
}
