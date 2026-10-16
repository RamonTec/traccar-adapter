---
id: 016-T05
status: done           # todo | doing | blocked | done
depends_on: [016-T02, 016-T04]
covers: [AC-8, AC-9]
---

# 016-T05 — Guía de integración, política de versiones y enlace en README

## Contexto (leer SOLO esto)
- `docs/specs/016-published-contracts/design.md`

## Verificación
```bash
pnpm check
pnpm test:e2e
```

## Handoff
- `docs/contracts/README.md`: guía para api-core (auth, ids a guardar, flujos, tabla de errores y reintentos,
  patrón `pending` → confirmar), para consumidores de eventos, política de versiones (semver por documento) e historial.
- Enlace "Contratos" en el README.
