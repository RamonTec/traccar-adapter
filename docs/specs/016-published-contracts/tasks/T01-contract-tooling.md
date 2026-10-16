---
id: 016-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-4]
---

# 016-T01 — Dependencias, cargador/validador de contratos y test de validez

## Contexto (leer SOLO esto)
- `docs/specs/016-published-contracts/design.md`

## Verificación
```bash
pnpm check
pnpm test:e2e
```

## Handoff
- devDependencies: `yaml`, `ajv`, `ajv-formats`, `@readme/openapi-parser`, `@asyncapi/specs`. Se descartó
  `@asyncapi/parser` (~1.400 líneas de lockfile y el paquete de telemetría `@scarf/scarf` con script de instalación):
  el AsyncAPI se valida con su JSON Schema oficial (`@asyncapi/specs`) y `ajv`.
- `test/support/contracts.ts`: `loadDocument` y `validateAgainst(doc, pointer, value)` (Ajv 2020, refs internos).
- Documentos esqueleto válidos; T02/T04 los completan.
