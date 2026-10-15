---
id: 006-T04
status: todo           # todo | doing | blocked | done
depends_on: [006-T02, 005-T04]
covers: [AC-1, AC-3, AC-6, AC-7, AC-8]
---

# 006-T04 — Extract device mapper and add TraccarDeviceStatusHttpAdapter

## Objetivo
`TraccarDeviceStatusHttpAdapter` lee un device y cambia **solo** su `disabled` en Traccar. Además, el mapeo DTO→`Device` queda en un único archivo compartido con el adapter de 005.

## Contexto (leer SOLO esto)
- `src/modules/device/application/ports/traccar-device-status.port.ts`
- `src/modules/device/infrastructure/outbound/traccar-device.http-adapter.ts` (de aquí se extrae `TraccarDeviceDto` y la función de mapeo)
- `src/shared/infrastructure/traccar/traccar-http-client.ts` (solo firma de `request`, `TraccarRequestError`)
- skill `traccar-api` (`SKILL.md` reglas 1 y 4)

## Contrato
```ts
// src/modules/device/infrastructure/outbound/traccar-device.mapper.ts
export interface TraccarDeviceDto {
  id: number; name: string; uniqueId: string; groupId: number; disabled: boolean;
  [key: string]: unknown;
}
export function toDevice(dto: TraccarDeviceDto): Device;   // { id, uniqueId, groupId, name, disabled }

// src/modules/device/infrastructure/outbound/traccar-device-status.http-adapter.ts
export class TraccarDeviceStatusHttpAdapter implements TraccarDeviceStatusPort {
  constructor(private readonly client: TraccarHttpClient) {}
  get(deviceId: number): Promise<Device | undefined>;
  //   GET /api/devices/{id}                                         op 'device.get'
  //   TraccarRequestError 400 cuyo traccarMessage contiene 'access denied' (insensible a mayúsculas) → undefined
  setDisabled(deviceId: number, disabled: boolean): Promise<void>;
  //   GET /api/devices/{id} (raw) → PUT /api/devices/{id} { ...raw, disabled }   op 'device.get' / 'device.setDisabled'
}
```
Datos de Traccar ya verificados:
- Un device inexistente da **400** `java.lang.SecurityException: Device access denied`, no 404.
- **Un PUT sin `groupId` lo pone a 0, y uno sin `name` da 400**: por eso se reenvía el objeto completo.

## Archivos a crear/modificar
- [ ] `src/modules/device/infrastructure/outbound/traccar-device.mapper.ts` (nuevo) + `.spec.ts`
- [ ] `src/modules/device/infrastructure/outbound/traccar-device.http-adapter.ts` (modificado: importa el mapper; comportamiento sin cambios, sus tests siguen en verde)
- [ ] `src/modules/device/infrastructure/outbound/traccar-device-status.http-adapter.ts` (nuevo)
- [ ] `src/modules/device/infrastructure/outbound/traccar-device-status.http-adapter.spec.ts` (nuevo, `TraccarHttpClient` real contra un servidor `node:http` en el puerto 0)

## Criterios de aceptación
- [ ] **AC-6** — `get(999)` con respuesta 400 `java.lang.SecurityException: Device access denied` → `undefined`. Otro 400 → `TraccarRequestError` propagado.
- [ ] **AC-1/AC-3/AC-7** — `setDisabled(18, true)`: el servidor recibe `GET /api/devices/18` y luego `PUT /api/devices/18`. El body del PUT es igual al del GET (`name`, `uniqueId`, `groupId`, `attributes`, `calendarId`…), salvo `disabled:true`. Lo mismo con `false`.
- [ ] **AC-8** — Respuesta 500 → `UpstreamUnavailableError`.
- [ ] `toDevice` descarta los campos que no son de dominio. Los tests de `traccar-device.http-adapter.spec.ts` (005) siguen en verde.

## Fuera de alcance
- Lógica de idempotencia (T03). Wiring (T06).

## Verificación
```bash
pnpm vitest run src/modules/device/infrastructure/outbound
pnpm check
```

## Handoff
