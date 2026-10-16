---
id: 015-T02
status: done           # todo | doing | blocked | done
depends_on: [015-T01]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7]
---

# 015-T02 — Workflow ci.yml con jobs check, e2e, image

## Contexto (leer SOLO esto)
- `docs/specs/015-ci-pipeline/design.md`

## Archivos a crear/modificar
- [x] `.github/workflows/ci.yml` (nuevo), según el contrato YAML del design

## Verificación
```bash
pnpm check
```

## Handoff
- Verificado en un clon limpio de la rama: `pnpm install --frozen-lockfile`, `pnpm check`, e2e 75/75 e imagen 11/11. La verificación definitiva son los checks del PR.
