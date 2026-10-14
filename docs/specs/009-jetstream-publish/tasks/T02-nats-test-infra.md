---
id: 009-T02
status: todo           # todo | doing | blocked | done
depends_on: []
covers: []
---

# 009-T02 — Add NATS test infrastructure and testing recipe

## Objetivo
Que cualquier agente o CI pueda levantar un NATS con JetStream para los tests en un solo comando, y que el skill de testing explique cómo usarlo.

## Contexto (leer SOLO esto)
- `package.json` (solo `scripts`)
- `docs/sdd/skills/automated-testing/recipes.md` (solo §7 y §6 como referencia de estilo)

## Contrato
```jsonc
// package.json scripts
"test:infra:up":   "docker run -d --rm --name traccar-adapter-test-nats -p 4222:4222 nats:2.11-alpine -js",
"test:infra:down": "docker stop traccar-adapter-test-nats"
```
```ts
// test/support/nats.ts
export const NATS_TEST_URL: string;                       // process.env.NATS_TEST_URL ?? 'nats://127.0.0.1:4222'
export function connectTestNats(): Promise<{ nc: NatsConnection; jsm: JetStreamManager }>;
// si no conecta en 2 s → throw new Error('NATS not reachable at <url>: run `pnpm test:infra:up`')
export function purgeStreamIfExists(jsm: JetStreamManager, name: string): Promise<void>;
```
Receta §7 de `recipes.md`: levantar la infraestructura, usar `connectTestNats` en `beforeAll`, purgar streams en `beforeEach`, leer mensajes con `jsm.streams.getMessage(stream, { last_by_subj })` y cerrar con `nc.close()` en `afterAll`.

## Archivos a crear/modificar
- [ ] `pnpm add @nats-io/transport-node @nats-io/jetstream`
- [ ] `package.json` (scripts)
- [ ] `test/support/nats.ts` (nuevo)
- [ ] `docs/sdd/skills/automated-testing/recipes.md` §7 (completar) y luego `pnpm sdd:sync`

## Criterios de aceptación
- [ ] Con `pnpm test:infra:up`, un test e2e de humo (`test/nats-infra.e2e-spec.ts`) conecta, crea un stream temporal, publica, lee el mensaje y lo borra.
- [ ] Sin NATS levantado, ese test falla con el mensaje `run \`pnpm test:infra:up\``.
- [ ] `pnpm check` en verde, con el sync de skills al día.

## Fuera de alcance
- Código de producción de NATS (T03-T05).

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e; pnpm test:infra:down
pnpm check
```

## Handoff
