---
id: 014-T02
status: todo
depends_on: [014-T01]
covers: [AC-1, AC-4, AC-5, AC-6, AC-7, AC-9]
---

# 014-T02 — Dockerfile, `.dockerignore` y scripts de build

## Objetivo
`pnpm docker:build` produce una imagen runtime mínima, no-root, con healthcheck y directorio de datos del outbox.

## Contexto (leer SOLO esto)
- `docs/specs/014-container-image/design.md` (esqueleto del Dockerfile y decisiones)
- `package.json`
- `.gitignore`

## Contrato
Ver esqueleto del design: base `node:24.22.0-alpine3.24`, stages `deps` → `build` → `prod-deps` → `runtime`,
`ENV NODE_ENV=production OUTBOX_PATH=/app/data/outbox.db`, `USER node`, `VOLUME ["/app/data"]`, `EXPOSE 3000`,
`HEALTHCHECK` con `node -e fetch(…/health)`, `CMD ["node", "dist/main.js"]`.
`package.json`: `"packageManager": "pnpm@11.20.0"`, `"docker:build": "docker build -t traccar-adapter:local ."`.

## Archivos a crear/modificar
- [ ] `Dockerfile` (nuevo)
- [ ] `.dockerignore` (nuevo)
- [ ] `package.json` (mod)

## Criterios de aceptación
- [ ] **AC-1** — `pnpm docker:build` termina OK con `--frozen-lockfile`.
- [ ] **AC-4/5/6/7/9** — Verificación manual rápida (`docker image inspect`, `docker run --rm … ls -A /app`); los tests automáticos llegan en T03/T04.

## Fuera de alcance
- Tests automatizados de la imagen (T03, T04). Publicación en registro (015).

## Verificación
```bash
pnpm docker:build
docker image inspect traccar-adapter:local --format '{{.Config.User}} {{json .Config.Healthcheck}}'
pnpm check
```

## Handoff
