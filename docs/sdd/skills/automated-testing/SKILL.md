---
name: automated-testing
description: Write, fix or review automated tests (unit, integration, e2e) in traccar-adapter with Vitest, NestJS testing and supertest. Use when implementing an SDD task's acceptance criteria (TDD), adding fakes for ports, testing controllers/filters/logging, HTTP adapters against Traccar, or process-level e2e.
---

# Automated testing — traccar-adapter

Reglas (qué debe cumplirse): `docs/standards/testing.md`. Este skill es el **cómo**. No dupliques reglas aquí.

## Flujo TDD por task

1. Lee los `AC-n` del task. Cada uno → al menos un `it('AC-n: <comportamiento>', …)`.
2. Escribe el test, ejecútalo y **comprueba que falla por el motivo correcto** (no por import roto).
3. Implementa lo mínimo para pasar. Refactoriza con el test en verde.
4. Cierra con `pnpm check`.

## Elegir el tipo de test

| Qué pruebas | Tipo | Receta en `recipes.md` |
|-------------|------|------------------------|
| Entidad, VO, función pura | unit | §1 |
| Use case | unit con **fake** del port | §2, §3 |
| Controller, filter, guard, logging | integración Nest + supertest | §4 |
| Adapter HTTP hacia Traccar | integración con servidor HTTP falso (`node:http`) | §5 |
| Arranque, señales, exit codes | e2e de proceso (`dist/main.js`) | §6 |

Carga `recipes.md` y lee **solo** la sección que necesitas.

## Ubicación y nombres

- Unit/integración: junto al archivo, `<nombre>.spec.ts` (corre con `pnpm test`).
- E2E: `test/*.e2e-spec.ts` (corre con `pnpm test:e2e`).
- Fakes de ports: `src/modules/<feature>/application/ports/__fakes__/<port>.fake.ts`.
- Helpers compartidos de test: `test/support/` (p.ej. `log-capture.ts`).

## Comandos

```bash
pnpm vitest run <ruta>            # un archivo o carpeta
pnpm vitest run -t "AC-3"         # por nombre de test
pnpm test:cov                     # cobertura
pnpm test:e2e                     # e2e
```

## Trampas conocidas

- **ESM**: imports relativos con `.js` también en specs (`'./imei.js'`).
- **Globals**: `describe/it/expect/vi` son globales (Vitest `globals: true`); no los importes.
- **Nest app en tests**: siempre `await app.close()` en `afterEach/afterAll`, o el proceso de Vitest queda colgado.
- **Logs**: para afirmar sobre logs usa `createLogCapture()` + `app.useLogger(app.get(Logger))` (nestjs-pino); nunca espíes `process.stdout`.
- **Asincronía de pino-http**: el log de fin de request se escribe en `res.on('finish')`; la respuesta de supertest ya llegó, pero si un assert de log falla de forma intermitente, espera con `await vi.waitFor(() => expect(…))`.
- **Tiempo/aleatoriedad**: inyecta generadores (`generate`, `ClockPort`) en lugar de `vi.useFakeTimers()` salvo para reintentos/backoff.
- **Puertos de red**: escucha en puerto `0` y lee el asignado; nunca puertos fijos.
- **No mocks mágicos de módulos** (`vi.mock('…')`) para ports: usa fakes escritos a mano (§3). `vi.fn()` está bien para callbacks.
- **Afirma comportamiento observable** (respuesta, log, mensaje publicado), no llamadas internas privadas.
