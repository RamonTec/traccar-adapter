---
id: 002-T04
status: todo           # todo | doing | blocked | done
depends_on: [002-T03]
covers: [AC-1, AC-6, AC-7, AC-11]
---

# 002-T04 — Wire global guard, public health and actor logging

## Objetivo
Activar la autenticación en la app real: guard global, `/health` público, y `actor` en el log de cada request autenticada.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/shared/infrastructure/logging/pino-http-options.ts`
- `src/shared/infrastructure/http/health.controller.ts`
- `test/app.e2e-spec.ts`

## Contrato
```ts
// app.module.ts — providers += 
{ provide: JwtVerifier, useFactory: (c: AppConfig) => new JwtVerifier(c.auth), inject: [APP_CONFIG] },
{ provide: APP_GUARD, useClass: ServiceAuthGuard },
// AppModule.register(config, logStream?, overrides?: { jwtVerifier?: Pick<JwtVerifier, 'verify'> })  ← para e2e sin Keycloak

// health.controller.ts → @Public() a nivel de clase
// pino-http-options.ts → customSuccessObject/customErrorObject añaden `actor` si (req as { actor?: string }).actor está definido
```

## Archivos a crear/modificar
- [ ] `src/app.module.ts` (modificar)
- [ ] `src/shared/infrastructure/http/health.controller.ts` (modificar)
- [ ] `src/shared/infrastructure/logging/pino-http-options.ts` (modificar)
- [ ] `test/app.e2e-spec.ts` (ampliar; añade un controller de prueba solo vía test module si hace falta una ruta protegida)

## Criterios de aceptación
- [ ] **AC-7** — E2E in-process: `GET /health` sin token → 200. El e2e de proceso real sigue en verde.
- [ ] **AC-1** — E2E: una ruta protegida de prueba sin token → `401 { code: 'UNAUTHORIZED', … }`.
- [ ] **AC-6** — Con un verifier fake que devuelve `actor: 'core-service'`, el log de fin de request de la ruta protegida tiene `actor: 'core-service'`.
- [ ] **AC-11** — En la request autenticada, ninguna línea de log capturada contiene el valor del token.
- [ ] Los tests de logging de 001 siguen pasando: `actor` no aparece cuando no hay autenticación.

## Fuera de alcance
- Rutas de negocio (004-006). Webhook público (008).

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
