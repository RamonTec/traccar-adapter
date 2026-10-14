# Estándar: Arquitectura

Hexagonal (ports & adapters), organizada **por feature primero, capa después** (ADR-0001): un task suele tocar un solo módulo, así el contexto a cargar es pequeño.

## Layout

```
src/
  main.ts
  app.module.ts
  shared/                         # transversal, sin lógica de negocio
    domain/                       # errores base, tipos puros compartidos
    application/ports/            # puertos transversales (p.ej. LoggerPort, ClockPort)
    infrastructure/
      config/                     # carga y validación de env
      logging/                    # logger estructurado, correlation-id
      traccar/                    # cliente HTTP de bajo nivel hacia Traccar (auth, base URL)
      nats/                       # conexión JetStream compartida
  modules/
    <feature>/                    # group | device | ingestion
      domain/                     # entidades, value objects, errores de dominio
      application/
        ports/                    # interfaces que el use case necesita (outbound)
        use-cases/                # un archivo por use case
      infrastructure/
        inbound/                  # controllers HTTP, DTOs, guards
        outbound/                 # adapters que implementan los ports
      <feature>.module.ts         # wiring DI
test/                             # e2e
```

## Regla de dependencias (enforced por `.oxlintrc.json`)

| Capa | Puede importar | No puede importar |
|------|----------------|-------------------|
| `domain` | `shared/domain` | `@nestjs/*`, `application`, `infrastructure`, libs externas de I/O |
| `application` | `domain`, `shared/domain`, `shared/application` | `@nestjs/*`, `infrastructure` |
| `infrastructure` | todo lo anterior, NestJS, libs externas | — |

- Un módulo **no** importa internals de otro módulo. Lo compartido sube a `shared/`.
- Los use cases son clases TS planas (sin decoradores). Se registran en `<feature>.module.ts` con `useFactory` + tokens de inyección.
- Los ports se definen en el módulo que los **consume**, con nombre `<Algo>Port` y un token `export const <ALGO>_PORT = Symbol('<Algo>Port')` en el mismo archivo.

## Convenciones de archivos

| Elemento | Archivo | Clase/símbolo |
|----------|---------|---------------|
| Entidad | `domain/device.ts` | `Device` |
| Value object | `domain/imei.ts` | `Imei` |
| Error de dominio | `domain/errors.ts` | `InvalidImeiError extends DomainError` |
| Port | `application/ports/traccar-device.port.ts` | `TraccarDevicePort`, `TRACCAR_DEVICE_PORT` |
| Use case | `application/use-cases/register-device.use-case.ts` | `RegisterDeviceUseCase` con método `execute(input)` |
| Adapter | `infrastructure/outbound/traccar-device.http-adapter.ts` | `TraccarDeviceHttpAdapter implements TraccarDevicePort` |
| Controller | `infrastructure/inbound/device.controller.ts` | `DeviceController` |
| DTO | `infrastructure/inbound/dto/register-device.dto.ts` | `RegisterDeviceDto` |

## Restricciones de dominio

- API surface: nunca un endpoint/método que cambie el `groupId` de un device (FR3). Los DTOs de update no incluyen `groupId`.
- Sin persistencia propia. Si un spec parece requerir BD, es una señal de que la responsabilidad es de otro servicio (ver "Out of scope" en planning).
