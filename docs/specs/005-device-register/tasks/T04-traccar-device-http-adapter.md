---
id: 005-T04
status: done           # todo | doing | blocked | done
depends_on: [005-T02, 003-T04]
covers: [AC-1, AC-4, AC-6, AC-8, AC-11]
---

# 005-T04 — Add TraccarDeviceHttpAdapter

## Objetivo
`TraccarDeviceHttpAdapter` implementa `TraccarDevicePort` contra Traccar 6.15.3. `retire` nunca altera el `groupId` ni el `disabled` del device.

## Contexto (leer SOLO esto)
- `src/modules/device/application/ports/traccar-device.port.ts`
- `src/shared/infrastructure/traccar/traccar-http-client.ts` (solo firma de `request`, `TraccarRequestError`)
- skill `traccar-api` (`SKILL.md` reglas 1-6 y `reference.md` §4-§9)
- skill `automated-testing` (`recipes.md` §5)

## Contrato
```ts
// src/modules/device/infrastructure/outbound/traccar-device.http-adapter.ts
export class TraccarDeviceHttpAdapter implements TraccarDevicePort {
  constructor(private readonly client: TraccarHttpClient) {}
  groupExists(groupId: number): Promise<boolean>;
  //   GET /api/groups → some(g => g.id === groupId)                         op 'group.list'
  findByUniqueId(uniqueId: string): Promise<Device | undefined>;
  //   GET /api/devices?uniqueId=<x> → [0] (o undefined)                     op 'device.find'
  create(input: CreateDeviceCommand): Promise<Device>;
  //   POST /api/devices { name, uniqueId, groupId }                          op 'device.create'
  //   TraccarRequestError 400 cuyo traccarMessage contiene 'UNIQUEID' o
  //   'Unique index or primary key violation' → DeviceUniqueIdTakenError(uniqueId)
  retire(deviceId: number, newUniqueId: string): Promise<void>;
  //   GET /api/devices/{id} (raw) → PUT /api/devices/{id} { ...raw, uniqueId: newUniqueId }
  //   op 'device.get' / 'device.retire'
}
// TraccarDeviceDto (privado del archivo): { id, name, uniqueId, groupId, disabled, ...resto }
// → Device { id, uniqueId, groupId, name, disabled }
```
Datos de Traccar ya verificados:
- POST responde **200**.
- Un `uniqueId` duplicado da **400** con un body en texto plano.
- La búsqueda por `uniqueId` también encuentra devices deshabilitados.
- **Un PUT sin `groupId` lo pone a 0**: por eso se hace GET y se reenvía el objeto completo.

## Archivos a crear/modificar
- [x] `src/modules/device/infrastructure/outbound/traccar-device.http-adapter.ts` (nuevo)
- [x] `src/modules/device/infrastructure/outbound/traccar-device.http-adapter.spec.ts` (nuevo, `TraccarHttpClient` real contra un servidor `node:http` en el puerto 0)

## Criterios de aceptación
- [x] **AC-1** — `create` envía `POST /api/devices` con `{name, uniqueId, groupId}` y mapea la respuesta 200 a `Device`.
- [x] **AC-1b** — `findByUniqueId` envía la query `uniqueId=<x>`. Con `[]` devuelve `undefined`; con un elemento `disabled:true` devuelve `Device` con `disabled:true`.
- [x] **AC-4 / AC-11** — `retire(18, 'x:retired:18')`: el servidor recibe `GET /api/devices/18` y luego `PUT /api/devices/18`. El body del PUT es igual al del GET (incluidos `groupId`, `disabled`, `name`, `attributes`, `calendarId`), salvo `uniqueId`.
- [x] **AC-6** — `groupExists(2)` → `true` si `/api/groups` contiene `{id:2}`; `groupExists(3)` → `false`.
- [x] **Carrera** — POST con 400 y body que contiene `Unique index or primary key violation ... TC_DEVICES(UNIQUEID` → `DeviceUniqueIdTakenError`. Otro 400 → `TraccarRequestError` sin traducir.
- [x] **AC-8** — Respuesta 500 en cualquier operación → `UpstreamUnavailableError`.

## Fuera de alcance
- Lógica de decisión (T03). Wiring (T06).

## Verificación
```bash
pnpm vitest run src/modules/device/infrastructure/outbound
pnpm check
```

## Handoff
- Implementado `TraccarDeviceHttpAdapter` implementando `TraccarDevicePort` contra endpoints de Traccar 6.15.3.
- `retire` preserva la totalidad de los atributos del device recuperado por GET al realizar el PUT (FR3/NFR5).
- Mapeado 400 de violación de índice único a `DeviceUniqueIdTakenError`.
- Desbloquea T06 (wiring en DeviceModule).
