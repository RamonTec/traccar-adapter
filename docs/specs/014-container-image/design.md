---
spec: 014-container-image
status: approved       # draft | approved
---

# 014 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| raíz | `Dockerfile` | N | Build multi-stage: deps → build → deps de producción → runtime no-root con healthcheck |
| raíz | `.dockerignore` | N | Contexto mínimo: fuera `.git`, `.env*`, `node_modules`, `dist`, `data`, `test`, `docs`, `dev`, `.claude`, `.agents`, `coverage` |
| raíz | `package.json` | M | `packageManager: pnpm@11.20.0`; scripts `docker:build` y `test:image` |
| shared/infra | `src/shared/infrastructure/nats/nats-connection.manager.ts` | M | Apagado acotado: `drain()` con límite de 5 s y luego `close()` |
| test | `test/nats-connection.e2e-spec.ts` | M | NATS caído tras conectar → `app.close()` termina en < 6 s |
| test | `vitest.config.image.ts` | N | Suite de imagen (`**/*.image-spec.ts`), serie, timeouts largos; fuera de `pnpm check` |
| test | `test/image/container.image-spec.ts` | N | Construye la imagen una vez y verifica AC-1..AC-9 con la CLI de Docker |
| test | `test/image/docker.ts` | N | Helpers: `docker(...args)`, `runContainer`, `waitHealthy`, `removeAll` |
| docs | `README.md` | M | Sección "Imagen de contenedor": build, run, volumen, healthcheck, señales |

## Contratos internos
```ts
// nats-connection.manager.ts
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;
// onApplicationShutdown: stopped = true; ready = false; clearTimeout(timer);
//   if (nc && !nc.isClosed()) {
//     const drained = await Promise.race([nc.drain().then(() => true, () => false), sleep(SHUTDOWN_DRAIN_TIMEOUT_MS).then(() => false)]);
//     if (!drained && !nc.isClosed()) await nc.close();   // log warn 'NATS drain timed out'
//   }

// test/image/docker.ts
export const IMAGE = 'traccar-adapter:test';
export function docker(args: string[], opts?: { timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string }>;
export function runContainer(name: string, opts: { env: Record<string, string>; volume?: string; network?: string; publish?: boolean }): Promise<{ port: number }>;
export function waitHealthy(name: string, timeoutMs: number): Promise<void>;   // docker inspect .State.Health.Status
export function removeAll(names: string[]): Promise<void>;                      // docker rm -f, ignora errores
```

```dockerfile
# Esqueleto (los valores exactos se fijan en el task)
FROM node:24.22.0-alpine3.24 AS base        # versión fijada (AC-1)
RUN corepack enable
WORKDIR /app
FROM base AS deps    # COPY package.json pnpm-lock.yaml; pnpm install --frozen-lockfile
FROM deps AS build   # COPY src tsconfig*.json nest-cli.json; pnpm build
FROM base AS prod-deps  # pnpm install --prod --frozen-lockfile
FROM node:24.22.0-alpine3.24 AS runtime
ENV NODE_ENV=production OUTBOX_PATH=/app/data/outbox.db
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node                                     # uid 1000 (AC-4)
VOLUME ["/app/data"]                          # AC-9
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]                  # exec form: SIGTERM llega a Node (AC-8)
```

## Flujo
**Build**: `pnpm docker:build` → `docker build -t traccar-adapter:local .`. Lockfile desalineado → `--frozen-lockfile` falla (AC-1).

**Arranque**: `node dist/main.js` (PID 1) → `loadConfig` → inválida: línea JSON a stderr y `exit(1)` (AC-3, ya existe) → válida: escucha en `PORT`; el healthcheck pasa a `healthy` (AC-2, AC-7).

**Parada** (`docker stop`, `SIGTERM`): Nest `enableShutdownHooks({ useProcessExit: true })` → cierra HTTP → `OutboxDrainer` cancela su timer → `NatsConnectionManager` drena (≤ 5 s) → `OutboxModule` cierra SQLite → `exit(0)` (AC-8). El peor caso (NATS caído a mitad de sesión) queda acotado por el límite de drain.

**Suite de imagen** (`pnpm test:image`, requiere Docker): `beforeAll` construye `traccar-adapter:test`; cada test usa contenedores con nombre único y los borra en `afterEach`.
| AC | Verificación |
|----|--------------|
| AC-1 | build con `--frozen-lockfile` OK; `node --version` en la imagen = `v24.22.0` |
| AC-2 | `docker run` con env válida (Traccar/Keycloak a URLs falsas, NATS ausente) → `GET /health` 200 |
| AC-3 | sin `WEBHOOK_TOKEN` → exit ≠ 0 y stderr contiene `WEBHOOK_TOKEN` |
| AC-4 | `docker exec … id -u` = `1000`; `Config.User` = `node` |
| AC-5 | `ls -A /app` = `data dist node_modules package.json`; sin `*.ts` (salvo `.d.ts`) fuera de `node_modules`; sin `.env*` en toda la imagen |
| AC-6 | `Config.Env` solo contiene `PATH`, `NODE_VERSION`, `YARN_VERSION`, `NODE_ENV`, `OUTBOX_PATH` |
| AC-7 | `Config.Healthcheck` definido; estado `healthy` tras arrancar |
| AC-8 | con NATS en red de test: conectado → `docker stop` → exit code `0` y duración < 10 s; ídem tras parar NATS |
| AC-9 | volumen con nombre + NATS parado → webhook → `buffered`; recrear contenedor con el mismo volumen; arrancar NATS → el mensaje llega al stream |

## Decisiones
- **Alpine** fijado por versión (`node:24.22.0-alpine3.24`): imagen pequeña, `node:sqlite` viene en Node y no hay dependencias nativas. Descartado `bookworm-slim` (~3× más grande) y *distroless* (sin shell para depurar ni para el test AC-5). Fijar por digest se deja para CI (015).
- **Node 24.22** en la imagen (el local es 24.16): misma major; la imagen manda.
- **pnpm vía corepack** con `packageManager` fijado; sin instalar pnpm global.
- **Healthcheck con `node -e fetch`**: no depende de `wget`/`curl` en la imagen.
- **Liveness, no readiness**, en el healthcheck: con Traccar caído el contenedor no está roto; reiniciarlo no ayuda.
- **`VOLUME /app/data`**: deja el directorio declarado; sin volumen con nombre Docker crea uno anónimo (no se pierde al reiniciar, sí al recrear).
- **Sin `tini`/`--init`**: Node registra sus handlers de `SIGTERM`; el exec form los recibe como PID 1.
- **Suite de imagen fuera de `pnpm check`**: necesita Docker y tarda; se ejecuta con `pnpm test:image` (y en CI, 015).

## Riesgos / preguntas abiertas
- Que `nc.drain()` cuelgue con NATS caído no está verificado; el límite de 5 s lo cubre en cualquier caso y el test de T01 lo comprueba.
- AC-9 depende de que el contenedor y NATS compartan una red Docker de test; la suite la crea y la borra.
