---
id: 006-T05
status: done           # todo | doing | blocked | done
depends_on: [006-T03, 004-T01, 002-T04]
covers: [AC-6, AC-9, AC-10]
---

# 006-T05 — Add DeviceStatusController with param/body validation and audit log

## Objetivo
`POST /devices/:deviceId/disable` y `/enable` validan el `deviceId` y que el body esté vacío, exigen `devices:write`, responden `200 {deviceId, disabled}` y dejan una línea de auditoría por petición.

## Contexto (leer SOLO esto)
- `src/modules/device/application/use-cases/set-device-status.use-case.ts` (solo firmas)
- `src/modules/device/infrastructure/inbound/device.controller.ts` (patrón a imitar)
- `src/shared/infrastructure/http/zod-validation.pipe.ts`
- `src/shared/infrastructure/auth/auth.decorators.ts`
- `test/support/log-capture.ts`

## Contrato
```ts
// src/modules/device/infrastructure/inbound/dto/device-status.dto.ts
export const deviceIdParamSchema = z.string().regex(/^[1-9]\d*$/, { message: 'deviceId must be a positive integer' })
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
export const emptyBodySchema = z.union([z.undefined(), z.object({}).strict()]);

// src/modules/device/infrastructure/inbound/device-status.controller.ts
@Controller('devices')
export class DeviceStatusController {
  private readonly logger = new Logger(DeviceStatusController.name);
  constructor(private readonly setStatus: SetDeviceStatusUseCase) {}   // token = la clase

  @Post(':deviceId/disable') @HttpCode(200) @RequireRole('devices:write')
  disable(
    @Param('deviceId', new ZodValidationPipe(deviceIdParamSchema)) deviceId: number,
    @Body(new ZodValidationPipe(emptyBodySchema)) _body: unknown,
    @Actor() actor: string | undefined,
  ): Promise<{ deviceId: number; disabled: boolean }>;

  @Post(':deviceId/enable') @HttpCode(200) @RequireRole('devices:write')
  enable(/* misma firma */): Promise<{ deviceId: number; disabled: boolean }>;
}
```
Reglas:
- Ambos métodos delegan en un helper privado `run(op, deviceId, disabled, actor)`.
- Auditoría en `try/finally`, una línea por petición válida, `info` si hay éxito y `warn` si falla:
  `{ op: 'device.disable' | 'device.enable', actor, deviceId, result, durationMs }`
  con `result`:
  - `changed | unchanged`, según `output.changed`;
  - `retired` (si es `DeviceRetiredError`);
  - `not-found` (si es `DeviceNotFoundError`);
  - `failed` (cualquier otro error, que se relanza sin tocarlo).
- Respuesta `{ deviceId: device.id, disabled: device.disabled }`.

## Archivos a crear/modificar
- [ ] `src/modules/device/infrastructure/inbound/dto/device-status.dto.ts` (nuevo) + `.spec.ts`
- [ ] `src/modules/device/infrastructure/inbound/device-status.controller.ts` (nuevo)
- [ ] `src/modules/device/infrastructure/inbound/device-status.controller.spec.ts` (nuevo: `Test.createTestingModule` con un use case falso vía `useValue`, `HttpExceptionFilter` como `APP_FILTER` y supertest)

## Criterios de aceptación
- [ ] **AC-6** — `deviceId` igual a `0`, `-1`, `abc`, `1.5` o `99999999999999999999` → 400 `VALIDATION_ERROR` con `details`, sin llamar al use case. `DeviceNotFoundError` → 404 `DEVICE_NOT_FOUND`.
- [ ] **AC-9a** — Body `{"x":1}` → 400 `VALIDATION_ERROR`. Sin body o con `{}` → aceptado.
- [ ] **AC-9b** — `Reflector` devuelve `'devices:write'` para `REQUIRED_ROLE_KEY` en `disable` y en `enable`.
- [ ] **HTTP** — `disable` → el use case recibe `{deviceId, disabled:true}`; `enable` → `disabled:false`. Ambas rutas responden 200 `{deviceId, disabled}` tanto con `changed:true` como con `false`. `DeviceRetiredError` → 409 `DEVICE_RETIRED`.
- [ ] **AC-10** — Con log-capture hay exactamente una línea por caso, con el `op` correcto: `changed`, `unchanged`, `retired`, `not-found`, y `failed` (con `UpstreamUnavailableError` → 503).

## Fuera de alcance
- Registro en módulo y lista permitida de rutas (T06).

## Verificación
```bash
pnpm vitest run src/modules/device/infrastructure/inbound
pnpm check
```

## Handoff
- `POST /devices/:deviceId/{disable,enable}` → 200 `{deviceId, disabled}`; `@RequireRole('devices:write')`.
- `device-status.dto.ts`: `deviceIdParamSchema` (string→int seguro) y `emptyBodySchema` (undefined | {} estricto).
- Auditoría en finally: info changed/unchanged; warn retired/not-found/failed. Niveles en log = etiquetas ('info'/'warn').
