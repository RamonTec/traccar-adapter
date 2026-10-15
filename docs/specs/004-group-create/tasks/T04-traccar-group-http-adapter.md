---
id: 004-T04
status: done           # todo | doing | blocked | done
depends_on: [004-T03, 003-T04]
covers: [AC-1, AC-5]
---

# 004-T04 — Add TraccarGroupHttpAdapter

## Objetivo
`TraccarGroupHttpAdapter` implementa `TraccarGroupPort` contra Traccar 6.15.3 con `GET /api/groups` y `POST /api/groups`.

## Contexto (leer SOLO esto)
- `src/modules/group/application/ports/traccar-group.port.ts`
- `src/shared/infrastructure/traccar/traccar-http-client.ts` (solo firma de `request` y errores)
- skill `traccar-api` (`reference.md` §2 y §3)
- skill `automated-testing` (`recipes.md` §5)

## Contrato
```ts
// src/modules/group/infrastructure/outbound/traccar-group.http-adapter.ts
export class TraccarGroupHttpAdapter implements TraccarGroupPort {
  constructor(private readonly client: TraccarHttpClient) {}
  list(): Promise<Group[]>;               // client.request<TraccarGroupDto[]>('group.list', 'GET', '/api/groups')
  create(name: string): Promise<Group>;   // client.request<TraccarGroupDto>('group.create', 'POST', '/api/groups', { body: { name } })
}
interface TraccarGroupDto { id: number; name: string; groupId?: number; attributes?: object }  // privado del archivo
// mapea a Group { id, name } — descarta el resto
```
Datos de Traccar ya verificados:
- `POST /api/groups` responde **200** (no 201) con `{ id, attributes:{}, groupId:0, name }`.
- `GET /api/groups` devuelve un array.
- El body de `create` es solo `{ name }`, sin `groupId`, para que el group no tenga padre (Traccar lo deja en `0`).

## Archivos a crear/modificar
- [x] `src/modules/group/infrastructure/outbound/traccar-group.http-adapter.ts` (nuevo)
- [x] `src/modules/group/infrastructure/outbound/traccar-group.http-adapter.spec.ts` (nuevo, `TraccarHttpClient` real contra un servidor `node:http` en el puerto 0)

## Criterios de aceptación
- [x] **AC-1** — `create('acme')` → el servidor falso recibe `POST /api/groups` con body exactamente `{"name":"acme"}`; ante una respuesta 200 `{id:3,attributes:{},groupId:0,name:'acme'}` el adapter devuelve `{id:3,name:'acme'}`.
- [x] **AC-1b** — `list()` ante `[{id:1,name:'a',groupId:0,attributes:{}}]` devuelve `[{id:1,name:'a'}]`.
- [x] **AC-5** — El servidor responde 500 → `list()` rechaza con `UpstreamUnavailableError`.

## Fuera de alcance
- Wiring DI (T06). Lógica de get-or-create (T03).

## Verificación
```bash
pnpm vitest run src/modules/group/infrastructure/outbound
pnpm check
```

## Handoff
- `TraccarGroupHttpAdapter(client: TraccarHttpClient)` es una clase plana: T06 la registra con `useFactory` e `inject: [TraccarHttpClient]` bajo `TRACCAR_GROUP_PORT`.
- Los errores (5xx/timeout → `UpstreamUnavailableError`, 4xx → `TraccarRequestError`) los produce el client; el adapter no los traduce.
- El helper `fakeTraccar` está dentro del spec (copiado de recipes §5); se puede extraer a `test/support/` si otro adapter lo necesita.
