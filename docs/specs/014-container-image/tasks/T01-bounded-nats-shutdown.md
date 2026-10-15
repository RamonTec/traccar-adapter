---
id: 014-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-8]
---

# 014-T01 — Acotar el drain de NATS en el apagado

## Objetivo
El apagado nunca espera más de 5 s a NATS, aunque se haya caído a mitad de sesión.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/nats/nats-connection.manager.ts`
- `test/nats-connection.e2e-spec.ts`
- `test/support/nats.ts`
- `docs/standards/testing.md`

## Contrato
```ts
const SHUTDOWN_DRAIN_TIMEOUT_MS = 5_000;
// onApplicationShutdown: drain() en carrera con 5 s; si no termina → close() y log warn 'NATS drain timed out'
```

## Archivos a crear/modificar
- [x] `src/shared/infrastructure/nats/nats-connection.manager.ts` (mod)
- [x] `test/nats-connection.e2e-spec.ts` (mod)

## Criterios de aceptación
- [x] **AC-8** — Conectado a NATS y con NATS detenido después, `app.close()` termina en < 6 s.
- [x] Con NATS disponible, el apagado sigue drenando (sin regresión en las suites e2e).

## Fuera de alcance
- Cambios en el orden de los hooks de Nest u otros módulos.

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
- `onApplicationShutdown` hace `drain()` en carrera con 5 s; si vence, log warn `NATS drain timed out` y `close()`.
- El corte limpio de TCP no colgaba; el cuelgue real es NATS sin responder con el socket abierto (partición). El test
  lo simula con un proxy TCP que descarta tráfico; sin el límite el apagado superaba los 20 s.
- Nota de entorno: el port-forward de Docker del host dejó de funcionar; e2e ejecutados dentro de un contenedor con
  `--network container:traccar-adapter-test-nats`.
