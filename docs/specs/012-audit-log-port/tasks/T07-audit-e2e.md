---
id: 012-T07
status: done           # todo | doing | blocked | done
depends_on: [012-T04, 012-T05, 012-T06]
covers: [AC-1, AC-5, AC-9, AC-10]
---

# 012-T07 — Add audit e2e suite across the four operations

## Objetivo
Una suite e2e en proceso demuestra que cada operación, entrando por HTTP, deja exactamente una línea `context: 'Audit'` y ninguna línea de auditoría desde los controllers.

## Contexto (leer SOLO esto)
- `test/device-status.e2e-spec.ts` (patrón: verifier falso, fake de Traccar con devices)
- `test/support/fake-traccar.ts`
- `test/support/log-capture.ts`

## Contrato
- App in-process con `AppModule.register(testConfig({ logLevel: 'info', traccar: { baseUrl } }), logs.stream, { jwtVerifier })`.
- Verifier falso con un token con `groups:write` y `devices:write` (actor `core-service`).
- Filtrar líneas por `context === 'Audit'`; las líneas con `context` = nombre de un controller y `op` definido no deben existir.

## Archivos a crear/modificar
- [ ] `test/audit.e2e-spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-1** — `POST /groups`, `POST /devices`, `POST /devices/:id/disable` y `/enable` → exactamente una línea `Audit` por petición, con el `op` correspondiente y `actor: 'core-service'`.
- [ ] **AC-5** — `durationMs` es entero ≥ 0 en todas.
- [ ] **AC-9** — Ninguna línea `Audit` contiene el token, `authorization` ni el body completo.
- [ ] **AC-10** — Toda la suite e2e en verde.

## Fuera de alcance
- Log del webhook (008), fuera del spec.

## Verificación
```bash
pnpm test:infra:up && pnpm test:e2e
pnpm check
```

## Handoff
- `test/audit.e2e-spec.ts`: group.create → device.register → disable → enable por HTTP dejan exactamente una línea `context: 'Audit'` cada una (actor, ids, durationMs entero ≥0) y ninguna desde los controllers; un 404 deja una línea warn `not-found`.
- Sin token, `authorization` ni body en las líneas Audit. e2e 70/70.
