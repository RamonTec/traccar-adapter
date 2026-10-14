---
id: 008-T01
status: todo           # todo | doing | blocked | done
depends_on: [002-T01]
covers: [AC-1, AC-5]
---

# 008-T01 — Add webhook config section

## Objetivo
Validar al arrancar el token compartido del webhook y el límite de tamaño del body.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts`
- `src/shared/infrastructure/config/app-config.spec.ts`
- `test/support/test-env.ts`

## Contrato
```ts
export interface WebhookConfig { readonly token: string; readonly maxBodyBytes: number }
// AppConfig += readonly webhook: WebhookConfig
// WEBHOOK_TOKEN: z.string().min(16) (obligatoria, secreto)
// WEBHOOK_MAX_BODY_BYTES: z.coerce.number().int().min(1024).max(10_485_760).default(1_048_576)
// TEST_ENV += WEBHOOK_TOKEN: 'test-webhook-token-0123456789'
```

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/config/app-config.ts` (modificar)
- [ ] `src/shared/infrastructure/config/app-config.spec.ts` (ampliar)
- [ ] `test/support/test-env.ts` (ampliar)

## Criterios de aceptación
- [ ] **AC-1a** — Sin `WEBHOOK_TOKEN`, o con menos de 16 caracteres → `ConfigValidationError` que nombra `WEBHOOK_TOKEN`, sin incluir su valor en el message.
- [ ] **AC-5a** — `WEBHOOK_MAX_BODY_BYTES` por defecto 1048576; `'512'` y `'20000000'` son inválidos.
- [ ] Los e2e siguen en verde (con `TEST_ENV`).

## Fuera de alcance
- Usar la config (T04, T05).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/config
pnpm test:e2e
pnpm check
```

## Handoff
