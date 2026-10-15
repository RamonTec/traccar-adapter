---
spec: 006-device-status
status: approved       # draft | approved
---

# 006 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| domain | `src/modules/device/domain/device.ts` | M | `isRetired(uniqueId)` |
| domain | `src/modules/device/domain/errors.ts` | M | `DeviceNotFoundError`, `DeviceRetiredError` |
| shared/infra | `src/shared/infrastructure/http/error-http-status.ts` | M | `DEVICE_NOT_FOUND: 404`, `DEVICE_RETIRED: 409` |
| application | `src/modules/device/application/ports/traccar-device-status.port.ts` | N | `TraccarDeviceStatusPort` + token |
| application | `src/modules/device/application/use-cases/set-device-status.use-case.ts` | N | Habilitar/deshabilitar de forma idempotente (AC-1..6, AC-8) |
| infra/outbound | `src/modules/device/infrastructure/outbound/traccar-device.mapper.ts` | N | `TraccarDeviceDto` + `toDevice()` extraídos del adapter de 005 |
| infra/outbound | `src/modules/device/infrastructure/outbound/traccar-device-status.http-adapter.ts` | N | GET + PUT del objeto completo cambiando solo `disabled` (AC-7) |
| infra/inbound | `src/modules/device/infrastructure/inbound/device-status.controller.ts` | N | `POST /devices/:deviceId/{disable,enable}` (AC-9, AC-10) |
| infra/inbound | `src/modules/device/infrastructure/inbound/dto/device-status.dto.ts` | N | Schemas zod del param y del body vacío (AC-6, AC-9) |
| wiring | `src/modules/device/device.module.ts` | M | Registrar el port, el use case y el controller |
| test | `test/route-allowlist.e2e-spec.ts` | M | Añadir las 2 rutas a `ALLOWED_ROUTES` |
| e2e | `test/device-status.e2e-spec.ts` | N | AC-1..9 con Traccar falso |

## Contratos internos
```ts
// domain/device.ts (añadir)
export const isRetired = (uniqueId: string): boolean => uniqueId.includes(':retired:');

// domain/errors.ts (añadir)
export class DeviceNotFoundError extends DomainError {   // 404
  readonly code = 'DEVICE_NOT_FOUND';
  constructor(readonly deviceId: number) { super(`Device ${deviceId} not found`); }
}
export class DeviceRetiredError extends DomainError {    // 409
  readonly code = 'DEVICE_RETIRED';
  constructor(readonly deviceId: number) { super(`Device ${deviceId} is retired and cannot be enabled`); }
}

// application/ports/traccar-device-status.port.ts
export const TRACCAR_DEVICE_STATUS_PORT = Symbol('TraccarDeviceStatusPort');
export interface TraccarDeviceStatusPort {
  get(deviceId: number): Promise<Device | undefined>;           // undefined = no existe o no es accesible
  /** Solo cambia `disabled`; conserva name, uniqueId, groupId y attributes (FR3, AC-7). */
  setDisabled(deviceId: number, disabled: boolean): Promise<void>;
}

// application/use-cases/set-device-status.use-case.ts
export interface SetDeviceStatusInput { deviceId: number; disabled: boolean }
export interface SetDeviceStatusOutput { device: Device; changed: boolean }
export class SetDeviceStatusUseCase {
  constructor(private readonly traccar: TraccarDeviceStatusPort) {}
  execute(input: SetDeviceStatusInput): Promise<SetDeviceStatusOutput>;
  // lanza DeviceNotFoundError | DeviceRetiredError | UpstreamUnavailableError
}

// infrastructure/inbound/dto/device-status.dto.ts
export const deviceIdParamSchema = z.string().regex(/^[1-9]\d*$/).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const emptyBodySchema = z.union([z.undefined(), z.object({}).strict()]);
// Respuesta: { deviceId: number; disabled: boolean }
```

## Flujo
1. Guard (`devices:write`). Luego los pipes: `deviceId` inválido o body no vacío → 400 (AC-6, AC-9).
2. `get(deviceId)` devuelve `undefined` → `DeviceNotFoundError` (404).
3. `disabled === input.disabled` → `{changed:false}` sin escribir (AC-2, AC-4). Esto ocurre **antes** de comprobar el retiro, así que deshabilitar un device retirado da 200 (AC-5).
4. Habilitar un device retirado → `DeviceRetiredError` (409, AC-5).
5. `setDisabled(deviceId, disabled)` → el adapter hace `GET /api/devices/{id}` y luego `PUT {...raw, disabled}` (AC-1, AC-3, AC-7) → `{changed:true}`.
6. Traccar caído → 503 (AC-8).
7. El controller loguea en `finally` `{op:'device.disable'|'device.enable', actor, deviceId, result, durationMs}`, con `result` = `changed|unchanged|retired|not-found|failed` (AC-10).

## Decisiones
- **Port nuevo `TraccarDeviceStatusPort`** en vez de ampliar `TraccarDevicePort`. El test de tipos de 005-T02 fija las claves de ese port, y separarlos mantiene ambas interfaces mínimas. El nuevo port lleva su propio test de tipos: `setDisabled` debe ser `(number, boolean)`.
- **Un solo use case** con `disabled: boolean`. Las dos rutas solo difieren en el valor y en el `op` del log.
- **Device inexistente**: Traccar responde **400 `SecurityException: Device access denied`** (no 404). El adapter traduce `TraccarRequestError` 400 con `access denied` a `undefined`; cualquier otro 4xx se propaga.
- **`setDisabled` vuelve a hacer GET** en vez de recibir el objeto: así el PUT siempre parte del estado fresco y la firma no expone campos que mover. Cuesta un GET extra por cada cambio.
- **El mapper se extrae a su propio archivo** para que los dos adapters de device no dupliquen `TraccarDeviceDto` y `toDevice`.
- **Controller aparte** (`DeviceStatusController`), para no hacer crecer `DeviceController`.
- **Logs**: igual que en 004 y 005, solo se loguean las peticiones que pasan auth y validación. Un 400 de validación no deja línea `device.*`.

## Riesgos / preguntas abiertas
- "Access denied" mezcla *no existe* con *no accesible*. Con un usuario de servicio que es dueño de todos los devices (ADR-0005 §7) es equivalente.
- Carrera disable/enable concurrentes sobre el mismo device: gana el último PUT. Es aceptable porque core-service serializa por device (NFR1).
