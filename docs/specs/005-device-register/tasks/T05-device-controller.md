---
id: 005-T05
status: todo           # todo | doing | blocked | done
depends_on: [005-T03, 004-T01, 002-T04]
covers: [AC-7, AC-9, AC-10]
---

# 005-T05 — Add RegisterDevice DTO and DeviceController with audit log

## Objetivo
`POST /devices` valida el body, exige `devices:write`, responde 201 o 200 según el resultado y deja una línea de auditoría `device.register` por petición.

## Contexto (leer SOLO esto)
- `src/modules/device/application/use-cases/register-device.use-case.ts` (solo firmas)
- `src/modules/group/infrastructure/inbound/group.controller.ts` (patrón a imitar)
- `src/shared/infrastructure/http/zod-validation.pipe.ts`
- `src/shared/infrastructure/auth/auth.decorators.ts`
- `test/support/log-capture.ts`

## Contrato
```ts
// src/modules/device/infrastructure/inbound/dto/register-device.dto.ts
export const registerDeviceSchema = z.object({
  uniqueId: z.string().regex(/^\d{15}$/, { message: 'uniqueId must be exactly 15 digits' }),
  name: z.string().min(1).max(128),
  groupId: z.number().int().positive(),
}).strict();
export type RegisterDeviceDto = z.infer<typeof registerDeviceSchema>;

// src/modules/device/infrastructure/inbound/device.controller.ts
@Controller('devices')
export class DeviceController {
  private readonly logger = new Logger(DeviceController.name);
  constructor(private readonly registerDevice: RegisterDeviceUseCase) {}   // token = la clase
  @Post()
  @RequireRole('devices:write')
  register(
    @Body(new ZodValidationPipe(registerDeviceSchema)) dto: RegisterDeviceDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ deviceId: number; uniqueId: string; groupId: number }>;
}
```
Reglas:
- `existing` → 200; `created` y `retired-and-created` → 201.
- Body `{ deviceId: device.id, uniqueId: device.uniqueId, groupId: device.groupId }`.
- Auditoría en `try/finally`, una línea por petición válida, `info` si hay éxito y `warn` si falla:
  `{ op:'device.register', actor, uniqueId, groupId, deviceId?, retiredDeviceId?, result, durationMs }`
  con `result` = el del use case `| 'conflict'` (si es `DeviceAlreadyRegisteredError`) `| 'failed'` (cualquier otro error, que se relanza sin tocarlo).

## Archivos a crear/modificar
- [ ] `src/modules/device/infrastructure/inbound/dto/register-device.dto.ts` (nuevo) + `.spec.ts`
- [ ] `src/modules/device/infrastructure/inbound/device.controller.ts` (nuevo)
- [ ] `src/modules/device/infrastructure/inbound/device.controller.spec.ts` (nuevo: `Test.createTestingModule` con un use case falso vía `useValue`, `HttpExceptionFilter` como `APP_FILTER` y supertest)

## Criterios de aceptación
- [ ] **AC-7** — El schema rechaza: `uniqueId` de 14 o 16 dígitos o con letras, `name:''`, `name` de 129 caracteres, `groupId` 0, -1, 1.5 o `'5'`, y campos extra. Acepta un caso válido. Vía HTTP: 400 `VALIDATION_ERROR` con `details` y sin llamar al use case.
- [ ] **AC-1/2/4 (HTTP)** — Use case falso con `created` → 201; con `existing` → 200; con `retired-and-created` → 201. El body coincide con el contrato.
- [ ] **AC-9** — `Reflector` devuelve `'devices:write'` para `REQUIRED_ROLE_KEY` en `register`.
- [ ] **AC-10** — Con log-capture, para cada caso (`created`, `existing`, `retired-and-created` con `retiredDeviceId`, `DeviceAlreadyRegisteredError` → 409 `conflict`, `GroupNotFoundError` → 404 `failed`, `UpstreamUnavailableError` → 503 `failed`) hay exactamente una línea `op:'device.register'` con los campos correctos.

## Fuera de alcance
- Wiring (T06). Lista permitida de rutas (T07).

## Verificación
```bash
pnpm vitest run src/modules/device/infrastructure/inbound
pnpm check
```

## Handoff
