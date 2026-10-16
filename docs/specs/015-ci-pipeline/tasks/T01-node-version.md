---
id: 015-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-3]
---

# 015-T01 — .node-version como fuente única de la versión de Node

## Contexto (leer SOLO esto)
- `docs/specs/015-ci-pipeline/design.md`

## Archivos a crear/modificar
- [x] `.node-version` (nuevo), `Dockerfile` (comentario), `test/image/container.image-spec.ts` (AC-1 de 014 lee `.node-version`)

## Verificación
```bash
pnpm check
```

## Handoff
- `.node-version` = 24.22.0; el test AC-1 de 014 compara la imagen con ese archivo (si se desalinean, `test:image` falla).
