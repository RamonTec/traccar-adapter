---
id: 005-T06
status: todo           # todo | doing | blocked | done
depends_on: [005-T04, 005-T05]
covers: []
---

# 005-T06 — Wire DeviceModule into AppModule

## Objetivo
La aplicación arranca con `DeviceModule` registrado y `POST /devices` resuelto contra el adapter HTTP real.

## Contexto (leer SOLO esto)
- `src/app.module.ts`
- `src/modules/group/group.module.ts` (patrón a imitar)
- `src/modules/group/group.module.spec.ts` (patrón de test)

## Contrato
```ts
// src/modules/device/device.module.ts
@Module({
  controllers: [DeviceController],
  providers: [
    { provide: TRACCAR_DEVICE_PORT, useFactory: (c: TraccarHttpClient) => new TraccarDeviceHttpAdapter(c), inject: [TraccarHttpClient] },
    { provide: RegisterDeviceUseCase, useFactory: (p: TraccarDevicePort) => new RegisterDeviceUseCase(p), inject: [TRACCAR_DEVICE_PORT] },
  ],
})
export class DeviceModule {}
// src/app.module.ts → añadir DeviceModule a imports
```

## Archivos a crear/modificar
- [ ] `src/modules/device/device.module.ts` (nuevo) + `device.module.spec.ts`
- [ ] `src/app.module.ts` (modificado)

## Criterios de aceptación
- [ ] `device.module.spec.ts` resuelve `RegisterDeviceUseCase` y `DeviceController`, y `TRACCAR_DEVICE_PORT` es `instanceof TraccarDeviceHttpAdapter`.
- [ ] `pnpm test` y `pnpm test:e2e` existentes siguen en verde.

## Fuera de alcance
- Escenarios HTTP completos (T08).

## Verificación
```bash
pnpm vitest run src/modules/device
pnpm check
pnpm test:e2e
```

## Handoff
