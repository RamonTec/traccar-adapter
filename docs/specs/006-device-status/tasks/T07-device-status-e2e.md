---
id: 006-T07
status: todo           # todo | doing | blocked | done
depends_on: [006-T06, 005-T08]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-8, AC-9]
---

# 006-T07 — Add device-status e2e suite

## Objetivo
Una suite e2e en proceso prueba disable/enable de punta a punta contra el Traccar falso con estado de devices, incluida la conservación de `groupId` y de los demás atributos.

## Contexto (leer SOLO esto)
- `test/support/fake-traccar.ts`
- `test/device-register.e2e-spec.ts` (patrón de suite, verifier falso y siembra de devices)

## Contrato
- Reutiliza `test/support/fake-traccar.ts` tal cual. Ya imita a Traccar: GET de un id inexistente → 400 `access denied`, y un PUT sin `groupId` lo pone a 0.
- Si falta alguna capacidad, como sembrar un device con `attributes`, amplíala sin romper a quienes ya lo usan.
- Tokens del verifier falso: uno con `devices:write` y otro sin ese rol.

## Archivos a crear/modificar
- [ ] `test/device-status.e2e-spec.ts` (nuevo)
- [ ] `test/support/fake-traccar.ts` (solo si hace falta)

## Criterios de aceptación
- [ ] **AC-1 + AC-7** — Device habilitado (`groupId 3`, `attributes {a:1}`) → `disable` responde 200 `{deviceId, disabled:true}`. En el fake, `disabled:true` y `name`, `uniqueId`, `groupId` y `attributes` siguen iguales.
- [ ] **AC-2** — Repetir `disable` → 200 con el mismo cuerpo; el fake no recibió ningún PUT nuevo.
- [ ] **AC-3** — `enable` → 200 `{disabled:false}`, con `groupId` intacto.
- [ ] **AC-4** — Repetir `enable` → 200 sin PUT.
- [ ] **AC-5** — Device retirado (`uniqueId '…:retired:N'`, deshabilitado) → `enable` 409 `DEVICE_RETIRED`; `disable` 200 sin PUT.
- [ ] **AC-6** — `deviceId` 999 inexistente → 404 `DEVICE_NOT_FOUND`; `deviceId` `abc` → 400 `VALIDATION_ERROR`.
- [ ] **AC-8** — Traccar caído → 503 `UPSTREAM_UNAVAILABLE`. Tras recuperarse, el reintento converge (200).
- [ ] **AC-9** — Sin token → 401; token sin `devices:write` → 403; body `{"x":1}` → 400.

## Fuera de alcance
- AC-10 (logs), cubierto en T05.

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
