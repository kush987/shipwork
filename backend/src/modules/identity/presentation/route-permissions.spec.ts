import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ANY_MEMBER, AREA, IS_PUBLIC, NO_TENANT, OPS_ONLY, PERMISSION } from '../../../shared/auth/auth.constants';
import { ALL_ACTIONS } from '../domain/access.constants';
import { permissionFor } from './auth.guard.helpers';
import type { AccessArea, PermissionSpec } from '../../../shared/auth/auth.types';

type Ctor = new (...args: never[]) => unknown;

const MODULES = join(__dirname, '..', '..');

const controllerFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? controllerFiles(join(dir, entry.name)) : entry.name.endsWith('.controller.ts') ? [join(dir, entry.name)] : [],
  );

/** Every route of every controller: `GET /workflows/:id` → its handler and class. */
function routes() {
  return controllerFiles(MODULES).flatMap((file) =>
    Object.values(require(file) as Record<string, unknown>)
      .filter((value): value is Ctor => typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value))
      .flatMap((cls) =>
        Object.getOwnPropertyNames(cls.prototype)
          .map((name) => (cls.prototype as Record<string, unknown>)[name])
          .filter((handler): handler is object => typeof handler === 'function' && Reflect.hasMetadata(METHOD_METADATA, handler))
          .map((handler) => {
            const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
            const path = `/${[Reflect.getMetadata(PATH_METADATA, cls), Reflect.getMetadata(PATH_METADATA, handler)].filter((p) => p && p !== '/').join('/')}`;
            const meta = <T>(key: string): T | undefined => Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, cls);
            return { route: `${method} ${path}`, method, meta };
          }),
      ),
  );
}

describe('route permissions', () => {
  const all = routes();

  it('finds the controllers', () => {
    expect(all.length).toBeGreaterThan(100);
  });

  it('every workspace route checks a permission that exists in the catalog', () => {
    const problems = all.flatMap(({ route, method, meta }) => {
      if (meta(IS_PUBLIC) || meta(NO_TENANT) || meta(OPS_ONLY) || meta(ANY_MEMBER)) return [];
      const permission = permissionFor(meta<AccessArea>(AREA), meta<PermissionSpec>(PERMISSION), method, {});
      if (!permission) return [`${route}: no @Area or @Permission`];
      return ALL_ACTIONS.includes(permission.action) ? [] : [`${route}: ${permission.action} is not in the catalog`];
    });
    expect(problems).toEqual([]);
  });

  it.each([
    ['POST /workflows/:id/publish', 'workflows:publish'],
    ['POST /workflows/:id/test', 'workflows:run'],
    ['POST /workflows/:id/validate', 'workflows:read'],
    ['GET /nodes/catalog', 'workflows:read'],
    ['POST /executions/:id/replay', 'executions:run'],
    ['POST /shipments/:id/run-workflows', 'shipments:run'],
    ['POST /shipments/quote', 'shipments:read'],
    ['POST /events/emit', 'events:emit'],
    ['POST /auth-providers/:id/verify', 'auth-providers:read'],
    ['POST /members', 'members:manage'],
    ['DELETE /roles/:id', 'roles:manage'],
    ['PUT /workspace/database', 'database:manage'],
    ['GET /audit', 'audit:read'],
    ['GET /stats', 'dashboard:read'],
    ['PATCH /couriers/:code', 'couriers:write'],
  ])('%s needs %s', (route, action) => {
    const found = all.find((r) => r.route === route);
    expect(found).toBeDefined();
    expect(permissionFor(found!.meta<AccessArea>(AREA), found!.meta<PermissionSpec>(PERMISSION), found!.method, {})?.action).toBe(action);
  });
});
