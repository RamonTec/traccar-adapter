---
id: 016-T02
status: done           # todo | doing | blocked | done
depends_on: [016-T01]
covers: [AC-1, AC-2, AC-4, AC-5, AC-8]
---

# 016-T02 — openapi.yaml completo y test de rutas

## Contexto (leer SOLO esto)
- `docs/specs/016-published-contracts/design.md`

## Verificación
```bash
pnpm check
pnpm test:e2e
```

## Handoff
- `openapi.yaml` 1.0.0: 4 comandos + 2 health; respuestas comunes en `components/responses`; `code` fijado con `const` por respuesta.
- `routes.spec.ts` lee rutas reales con `DiscoveryService` + metadata de Nest (sin init, sin NATS) y excluye `/webhooks/`.
  Probado a la inversa: renombrar una ruta en el YAML hace fallar AC-5.
- AC-1/AC-2 también tienen tests estructurales (rol por comando, health públicos, `x-idempotent`, `x-retryable` solo en 5xx).
