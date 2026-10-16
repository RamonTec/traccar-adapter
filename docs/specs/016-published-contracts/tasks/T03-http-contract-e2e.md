---
id: 016-T03
status: done           # todo | doing | blocked | done
depends_on: [016-T02]
covers: [AC-6]
---

# 016-T03 — Registro de respuestas en e2e y validación contra el OpenAPI

## Contexto (leer SOLO esto)
- `docs/specs/016-published-contracts/design.md`

## Verificación
```bash
pnpm check
pnpm test:e2e
```

## Handoff
- `test/support/http-contract.ts`: middleware que registra las respuestas JSON (antes de `app.init()`) y
  `checkHttpContract` (status documentado + body contra el schema; rutas no documentadas se ignoran, AC-5 las cubre).
- Instalado en `group-create`, `device-register`, `device-status`, `audit` y los tres bloques in-process de `app`.
- Mutación comprobada: campo requerido inexistente y status 404 quitado → 4 tests fallan con el detalle.
