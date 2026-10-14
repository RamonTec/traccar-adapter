# Estándar: Código

## TypeScript

- `strict`. Prohibido `any` en `domain`/`application`; en `infrastructure` solo en el borde (payload crudo) y se convierte de inmediato a `unknown` + validación.
- ESM: imports relativos con extensión `.js`.
- `readonly` por defecto en propiedades de entidades/VO. Sin setters; cambios de estado vía métodos con nombre de negocio (`device.disable()`).
- Sin `export default`. Un concepto público por archivo.
- Sin comentarios que repitan el código; solo el *por qué* cuando no es obvio.

## Nombres

- Código, identificadores y mensajes de log/errores: **inglés**. Documentación SDD: español.
- Clases `PascalCase`, archivos `kebab-case.<rol>.ts` (ver tabla en `architecture.md`).
- Vocabulario de Traccar: `Device`, `Group`, `Position`, `Event`. Prohibido `vehicle`, `tenant` en este servicio.

## Errores

- Dominio/aplicación lanzan errores tipados que extienden `DomainError` (`shared/domain/errors.ts`), con `code` estable (`DEVICE_NOT_FOUND`).
- Errores de Traccar se traducen en el adapter a errores de aplicación (`TraccarUnavailableError`, etc.); nunca se filtra un error de HTTP client hacia el use case.
- El mapeo error → HTTP status vive en un único exception filter en `shared/infrastructure`.

## Validación

- Entrada HTTP: DTO validado en el borde (librería a definir en spec de foundation).
- Invariantes de negocio: en el constructor/factory de la entidad o VO (`Imei.create(raw)`), no en el controller.

## Logging (NFR4, Phase 3)

- Logger estructurado (JSON) con `correlationId` en cada línea.
- Obligatorio loguear: cada comando a Traccar (op, ids, resultado, duración), cada webhook recibido, cada publish a `telemetry.events` / `telemetry.deadletter`.
- Nunca loguear tokens ni headers de auth.
- El log **no** es mecanismo de entrega: un payload fallido va al deadletter, no solo al log.

## Configuración

- Toda config por variables de entorno, validadas al arranque (fail fast). Sin valores por defecto para secretos.
