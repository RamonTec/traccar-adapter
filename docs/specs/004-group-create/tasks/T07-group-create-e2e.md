---
id: 004-T07
status: todo           # todo | doing | blocked | done
depends_on: [004-T06]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-8]
---

# 004-T07 — Add group-create e2e suite

## Objetivo
Una suite e2e en proceso (`AppModule.register` + Traccar falso + verifier JWT falso) prueba `POST /groups` de punta a punta.

## Contexto (leer SOLO esto)
- `test/app.e2e-spec.ts` (solo `createFakeTraccar` y el bloque "Readiness and Traccar (in-process)", líneas ~48-120 y ~225-360)
- `test/support/test-env.ts`
- `src/app.module.ts` (solo `AppModule.register` y `AppModuleOverrides`)

## Contrato
- Extrae `createFakeTraccar` / `FakeTraccarServer` de `test/app.e2e-spec.ts` a `test/support/fake-traccar.ts` y amplíala con un estado en memoria de groups:
  - `GET /api/groups` → array.
  - `POST /api/groups` → 200 `{id, attributes:{}, groupId:0, name}`.
  - Un interruptor `down` para responder 500.
  
  Actualiza `app.e2e-spec.ts` para importarla y no dupliques el código.
- Verifier falso, como en `app.e2e-spec.ts`. Un token devuelve `{ actor:'core-service', roles:['groups:write'] }` y otro `roles: []`.

## Archivos a crear/modificar
- [ ] `test/support/fake-traccar.ts` (nuevo, extraído)
- [ ] `test/app.e2e-spec.ts` (modificado: import)
- [ ] `test/group-create.e2e-spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-1** — Traccar vacío → 201 `{groupId, name:'acme'}`; el fake recibió un POST con body `{"name":"acme"}`.
- [ ] **AC-2** — Repetir la petición → 200 con el mismo `groupId`; el fake tiene un solo group.
- [ ] **AC-3** — Fake con dos `'dup'` → 409 `GROUP_NAME_AMBIGUOUS`; no se hizo ningún POST.
- [ ] **AC-4** — `{name:''}` y `{name:'a', x:1}` → 400 `VALIDATION_ERROR` con `details`.
- [ ] **AC-5** — `down=true` → 503 `UPSTREAM_UNAVAILABLE`; tras `down=false` el mismo nombre → 201, y un tercer intento → 200.
- [ ] **AC-6** — Sin token → 401; token sin `groups:write` → 403.
- [ ] **AC-8** — `GET`, `PUT`, `PATCH` y `DELETE` sobre `/groups` y `/groups/1` → 404.

## Fuera de alcance
- AC-7 (logs), cubierto en T05.

## Verificación
```bash
pnpm test:e2e
pnpm check
```

## Handoff
