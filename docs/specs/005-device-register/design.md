---
spec: 005-device-register
status: approved       # draft | approved
---

# 005 — Diseño

## Componentes
| Capa | Archivo | N/M | Responsabilidad |
|------|---------|-----|-----------------|
| domain | `src/modules/device/domain/device.ts` | N | Tipo `Device` + `retiredUniqueId()` |
| domain | `src/modules/device/domain/errors.ts` | N | `DeviceAlreadyRegisteredError`, `GroupNotFoundError` |
| shared/infra | `src/shared/infrastructure/http/error-http-status.ts` | M | `DEVICE_ALREADY_REGISTERED: 409`, `GROUP_NOT_FOUND: 404` |
| application | `src/modules/device/application/ports/traccar-device.port.ts` | N | `TraccarDevicePort` + token + `DeviceUniqueIdTakenError` |
| application | `src/modules/device/application/use-cases/register-device.use-case.ts` | N | Get-or-create + retiro (AC-1..6, AC-8) |
| infra/outbound | `src/modules/device/infrastructure/outbound/traccar-device.http-adapter.ts` | N | `GET/POST /api/devices`, `GET+PUT /api/devices/{id}`, `GET /api/groups` |
| infra/inbound | `src/modules/device/infrastructure/inbound/dto/register-device.dto.ts` | N | Schema zod `.strict()` (AC-7) |
| infra/inbound | `src/modules/device/infrastructure/inbound/device.controller.ts` | N | `POST /devices`, rol, 201/200, log de auditoría (AC-9, AC-10) |
| wiring | `src/modules/device/device.module.ts` + `src/app.module.ts` | N/M | DI con `useFactory` + tokens |
| test | `test/route-allowlist.e2e-spec.ts` | N | AC-11: rutas registradas = lista permitida |
| e2e | `test/device-register.e2e-spec.ts` | N | AC-1..9 con Traccar falso |

Reutiliza de 004: `ValidationError`, `ZodValidationPipe`, `details` en el filtro (004-T01) y `test/support/fake-traccar.ts` (004-T07).

## Contratos internos
```ts
// domain/device.ts
export interface Device {
  readonly id: number; readonly uniqueId: string; readonly groupId: number;
  readonly name: string; readonly disabled: boolean;
}
export const retiredUniqueId = (uniqueId: string, deviceId: number) => `${uniqueId}:retired:${deviceId}`;

// domain/errors.ts
export class DeviceAlreadyRegisteredError extends DomainError {   // 409
  readonly code = 'DEVICE_ALREADY_REGISTERED';
  constructor(readonly uniqueId: string, readonly existingGroupId: number) { super(...); }
}
export class GroupNotFoundError extends DomainError {             // 404
  readonly code = 'GROUP_NOT_FOUND';
  constructor(readonly groupId: number) { super(...); }
}

// application/ports/traccar-device.port.ts
export const TRACCAR_DEVICE_PORT = Symbol('TraccarDevicePort');
export class DeviceUniqueIdTakenError extends Error {}   // POST 400 + "UNIQUEID"/"Unique index" en el body
export interface TraccarDevicePort {
  groupExists(groupId: number): Promise<boolean>;
  findByUniqueId(uniqueId: string): Promise<Device | undefined>;
  create(input: { uniqueId: string; name: string; groupId: number }): Promise<Device>;
  /** Solo cambia uniqueId. Hace GET + PUT del objeto completo y conserva groupId/disabled (FR3). */
  retire(deviceId: number, newUniqueId: string): Promise<void>;
}

// application/use-cases/register-device.use-case.ts
export interface RegisterDeviceInput { uniqueId: string; name: string; groupId: number }
export type RegisterResult = 'created' | 'existing' | 'retired-and-created';
export interface RegisterDeviceOutput { device: Device; result: RegisterResult; retiredDeviceId?: number }
export class RegisterDeviceUseCase {
  constructor(private readonly traccar: TraccarDevicePort) {}
  execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput>;
  // lanza GroupNotFoundError | DeviceAlreadyRegisteredError | UpstreamUnavailableError
}

// infrastructure/inbound/dto/register-device.dto.ts
export const registerDeviceSchema = z.object({
  uniqueId: z.string().regex(/^\d{15}$/),
  name: z.string().min(1).max(128),
  groupId: z.number().int().positive(),
}).strict();
// Respuesta: { deviceId: number; uniqueId: string; groupId: number }
```

## Flujo
1. Guard (`devices:write`, AC-9), luego `ZodValidationPipe` (AC-7).
2. `groupExists(groupId)` es `false` → `GroupNotFoundError` (404, AC-6).
3. `findByUniqueId(uniqueId)`:
   - no existe → `create` → `created` (201, AC-1);
   - habilitado y mismo group → `existing` (200, sin escrituras, AC-2);
   - habilitado y otro group → `DeviceAlreadyRegisteredError` (409, AC-3);
   - deshabilitado → `retire(old.id, retiredUniqueId(uniqueId, old.id))` → `create` → `retired-and-created` (201, AC-4).
4. `create` lanza `DeviceUniqueIdTakenError` (carrera) → se relee una vez con `findByUniqueId` y se aplican las reglas de 3 (habilitado: 200 o 409); si sigue sin resolverse → `UpstreamUnavailableError`.
5. Traccar caído → 503 (AC-8). Si cae tras el retiro (AC-5), el reintento ya no encuentra el `uniqueId` original y vuelve al paso 3 como "no existe" (AC-1).
6. El controller loguea en `finally` `{op:'device.register', actor, uniqueId, groupId, deviceId?, retiredDeviceId?, result}`, con `result` = el del use case `| conflict | failed` (AC-10).

## Decisiones
- **`retire` no recibe `groupId` ni objeto**: el adapter hace GET del device y PUT del mismo objeto cambiando solo `uniqueId`. Así ninguna firma del port puede mover un device (AC-11, regla `traccar-api` #1). Descartado: pasar el `Device` de dominio, que pierde campos de Traccar y el PUT los anularía.
- **`groupExists` usa `GET /api/groups` y busca el id**: es un endpoint verificado. `GET /api/groups/{id}` sin verificar probablemente responde 400 en vez de 404, como devices.
- **Comprobar el group primero**: un 404 gana a todo lo demás, y es una lectura barata.
- **`name` en AC-2** se ignora: no se escribe en Traccar (renombrar está fuera de alcance).
- **AC-11 en dos partes**:
  - (a) `test/route-allowlist.e2e-spec.ts` arranca `AppModule` y compara las rutas de Express con una lista explícita (cada spec nuevo la amplía a propósito);
  - (b) un test de tipos (`expectTypeOf`) en `traccar-device.port.spec.ts` fija las claves del port y que `retire` sea `(number, string)`.
- Sin `Imei` VO: la regla "15 dígitos" vive solo en el DTO, porque en v1 no hay más invariantes.

## Riesgos / preguntas abiertas
- **Sin verificar:** la respuesta de `POST /api/devices` con un `groupId` inexistente. El paso 2 lo evita, pero si el group se borra entre la comprobación y la creación saldría un `TraccarRequestError` (→ 500). Se acepta: ADR-0005 §7 prohíbe borrar groups fuera del adapter.
- `GET /api/groups` sin paginar en cada registro: se asume, igual que en 004.
- La lista permitida de AC-11 la tocarán 006, 008 y otros; es intencionado.
