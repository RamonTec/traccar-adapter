---
id: 014-T04
status: done
depends_on: [014-T03]
covers: [AC-8, AC-9]
---

# 014-T04 — Suite de imagen: apagado y volumen del outbox; README

## Objetivo
Verificar en contenedor el apagado ordenado y que los pendientes del outbox sobreviven a recrear el contenedor.
Documentar la imagen en el README.

## Contexto (leer SOLO esto)
- `docs/specs/014-container-image/design.md` (tabla de verificación AC-8/AC-9)
- `test/image/docker.ts`, `test/image/container.image-spec.ts`
- `test/outbox.e2e-spec.ts` (cómo comprobar el mensaje en el stream)
- `README.md`

## Contrato
Red Docker de test (`traccar-adapter-image-test`) con un contenedor `nats:2.11-alpine -js` alcanzable como `nats`;
volumen con nombre para `/app/data`. Todo se crea en `beforeAll` y se borra en `afterAll`.

## Archivos a crear/modificar
- [x] `test/image/container.image-spec.ts` (mod)
- [x] `test/image/docker.ts` (mod, si hacen falta helpers de red/volumen)
- [x] `README.md` (mod: sección "Imagen de contenedor")

## Criterios de aceptación
- [x] **AC-8** — Conectado a NATS: `docker stop` → exit code 0 en < 10 s. Con NATS parado tras conectar: ídem.
- [x] **AC-9** — NATS parado → webhook → `buffered`; recrear el contenedor con el mismo volumen; arrancar NATS → el
      mensaje llega a `TELEMETRY_EVENTS`.

## Fuera de alcance
- Compose de la plataforma (`telemetry-infra`).

## Verificación
```bash
pnpm test:image
pnpm check
```

## Handoff
- Nueva suite `test/image/shutdown-and-volume.image-spec.ts` (3 tests) y helpers `streamMessages` / `stopTimed`.
- NATS "sin responder" se simula con `docker pause` (sockets abiertos, sin respuesta); `afterEach` lo reanuda.
- AC-9: el conteo del stream se lee desde un contenedor efímero de la propia imagen (ya trae el cliente NATS).
- README: sección "Imagen de contenedor".
