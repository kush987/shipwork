import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { config } from './config/configuration';
import { servesPath } from './config/planes';
import { DomainExceptionFilter } from './shared/http/domain-exception.filter';
import { API_PREFIX, RUNTIME_ROUTE } from './config/planes.constants';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  if (config.role === 'worker') {
    const app = await NestFactory.createApplicationContext(AppModule);
    app.enableShutdownHooks();
    logger.log(`Execution worker started (concurrency ${config.workerConcurrency})`);
    return;
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: false });
  // Behind a load balancer, read the client address from X-Forwarded-For (per-IP limits).
  app.set('trust proxy', config.trustProxy);
  const bodyLimit = `${config.maxRequestBodyKb}kb`;
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });
  app.setGlobalPrefix(API_PREFIX);
  // Endpoint calls (/api/run/*) come from customers' apps on any origin; the builder APIs only
  // from the configured frontend origins.
  const runtimePrefix = `/${API_PREFIX}/${RUNTIME_ROUTE}/`;
  app.enableCors((req: Request, callback: (error: Error | null, options: object) => void) =>
    callback(null, {
      origin: req.path.startsWith(runtimePrefix) ? true : config.corsOrigins,
      exposedHeaders: ['x-execution-id', 'x-request-id', 'retry-after', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset'],
    }),
  );
  app.enableShutdownHooks();
  // A runtime-only instance answers nothing but the data plane (see config/planes.ts).
  app.use((req: Request, res: Response, next: NextFunction) =>
    servesPath(config.role, req.path)
      ? next()
      : res.status(404).json({ statusCode: 404, message: `This instance (APP_ROLE=${config.role}) serves only the runtime gateway` }),
  );
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  if (config.role !== 'runtime') {
    const swagger = new DocumentBuilder()
      .setTitle('ShipFlow API')
      .setDescription('Workflow backend: build APIs, business logic and automations as workflows')
      .setVersion('0.2.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Session token from POST /api/auth/login' }, 'session')
      .addApiKey({ type: 'apiKey', in: 'header', name: 'x-tenant-id', description: 'Workspace id (one of your memberships)' }, 'tenant')
      .addSecurityRequirements('session')
      .addSecurityRequirements('tenant')
      .build();
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(config.port);
  logger.log(`HTTP listening on http://localhost:${config.port}/${API_PREFIX} (role: ${config.role}) · runtime at /${API_PREFIX}/run/:tenant/*`);
}

void bootstrap();
