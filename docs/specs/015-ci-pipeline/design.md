---
spec: 015-ci-pipeline
status: approved       # draft | approved
---

# 015 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| raíz | `.github/workflows/ci.yml` | N | Workflow con jobs `check`, `e2e`, `image` |
| raíz | `.node-version` | N | `24.22.0` (misma que la imagen de 014); lo leen CI y gestores de versiones locales |
| raíz | `Dockerfile` | M | Comentario: mantener `NODE_IMAGE` alineado con `.node-version` |
| test | `test/image/container.image-spec.ts` | M | AC-1 de 014 lee la versión esperada de `.node-version` (una sola fuente) |
| docs | `README.md` | M | Sección "Integración continua": qué corre, cómo reproducirlo y cómo hacerlo obligatorio |

## Contratos internos
```yaml
name: CI
on:
  pull_request: { branches: [main] }
  push: { branches: [main] }
permissions: { contents: read }                         # AC-7
concurrency:                                             # AC-5
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
jobs:
  check:   # checkout → pnpm/action-setup@v4 (lee packageManager) → setup-node@v5 (node-version-file: .node-version, cache: pnpm)
           # → pnpm install --frozen-lockfile → pnpm check
  e2e:     # mismo setup → docker run -d -p 4222:4222 nats:2.11-alpine -js → espera puerto → pnpm test:e2e
           # (service containers de Actions no admiten argumentos como `-js`)
  image:   # checkout → setup (Node para vitest) → pnpm test:image (construye la imagen con Docker del runner)
```
Los tres jobs corren en paralelo (`ubuntu-24.04`), con `timeout-minutes` (10/15/20).

## Flujo
1. PR → los tres jobs arrancan en paralelo; cada uno es un check del PR (`CI / check`, `CI / e2e`, `CI / image`).
2. Cualquier fallo → commit en rojo (AC-1). Push nuevo → la ejecución anterior se cancela (AC-5).
3. Merge → push a `main` → mismo workflow sobre `main`.

## Decisiones
- **Tres jobs paralelos** en lugar de uno secuencial: feedback más rápido y checks separados (AC-6).
- **NATS con `docker run`** en vez de `services:`: los service containers no permiten pasar `-js`.
- **`.node-version`** como fuente para CI; la imagen sigue fijada en el `Dockerfile` y el test de 014 compara ambos.
- **Sin caché de capas Docker** de momento: `test:image` tarda unos minutos; se revisará si molesta.
- **Sin publicar imagen** (sin `packages: write`): llega con el primer entorno remoto.

## Riesgos / preguntas abiertas
- No se puede ejecutar GitHub Actions en local: la verificación es el propio PR de este spec (sus checks deben salir
  en verde, y uno forzado en rojo debe marcar el PR).
