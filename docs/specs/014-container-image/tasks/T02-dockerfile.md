---
id: 014-T02
status: done
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
- [x] `Dockerfile` (nuevo)
- [x] `.dockerignore` (nuevo)
- [x] `package.json` (mod)

## Criterios de aceptación
- [x] **AC-1** — `pnpm docker:build` termina OK con `--frozen-lockfile`.
- [x] **AC-4/5/6/7/9** — Verificación manual rápida (`docker image inspect`, `docker run --rm … ls -A /app`); los tests automáticos llegan en T03/T04.

## Fuera de alcance
- Tests automatizados de la imagen (T03, T04). Publicación en registro (015).

## Verificación
```bash
pnpm docker:build
docker image inspect traccar-adapter:local --format '{{.Config.User}} {{json .Config.Healthcheck}}'
pnpm check
```

## Handoff
- Imagen `traccar-adapter:local` de ~284 MB (126 MB es el binario de Node; `node_modules` de producción 35 MB).
- `.dockerignore` en modo lista blanca: solo `package.json`, lockfile, `nest-cli.json`, `tsconfig*.json` y `src/`
  sin specs ni fakes.
- `prod-deps` con `--ignore-scripts`: ninguna dependencia de runtime necesita scripts de instalación.
- Comprobado a mano: usuario `node` (uid 1000), `ls -A /app` = `data dist node_modules package.json`, Node v24.22.0,
  sin `.env*`, config inválida → línea JSON con `invalidVariables`.
