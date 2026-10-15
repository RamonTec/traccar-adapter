---
id: 013-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-10]
---

# 013-T01 — Add outbox config section

## Objetivo
Validar al arrancar la ruta y el límite de tamaño del outbox, y documentarlos.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts`
- `src/shared/infrastructure/config/app-config.spec.ts`
- `test/support/test-env.ts`
- `README.md` (tabla de variables)

## Contrato
```ts
export interface OutboxConfig { readonly path: string; readonly maxBytes: number }
// AppConfig += readonly outbox: OutboxConfig
// OUTBOX_PATH: z.string().min(1).default('data/outbox.db')        (':memory:' válido)
// OUTBOX_MAX_BYTES: z.coerce.number().int().min(1_048_576).max(68_719_476_736).default(536_870_912)
// TEST_ENV += OUTBOX_PATH: ':memory:'; testConfig({ outbox }) con deep merge
```

## Archivos a crear/modificar
- [ ] `app-config.ts` + `.spec.ts`
- [ ] `test/support/test-env.ts`
- [ ] `README.md`: las 2 variables y una nota de despliegue (volumen persistente por réplica para `OUTBOX_PATH`; Compose: volumen con nombre; Kubernetes: StatefulSet + PVC)

## Criterios de aceptación
- [ ] **AC-10a** — Defaults: `data/outbox.db` y 536870912.
- [ ] **AC-10b** — `OUTBOX_MAX_BYTES` `1000` o `1e12` → `ConfigValidationError` que nombra la variable.
- [ ] Los e2e siguen en verde.

## Fuera de alcance
- Usar la config (T02).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/config
pnpm check
```

## Handoff
- `AppConfig.outbox` = { path (OUTBOX_PATH, default data/outbox.db), maxBytes (OUTBOX_MAX_BYTES 1 MiB..64 GiB, default 512 MiB) }.
- `TEST_ENV.OUTBOX_PATH = ':memory:'`; `testConfig({ outbox })`; README con variables y nota de volumen persistente; `data/` en .gitignore.
