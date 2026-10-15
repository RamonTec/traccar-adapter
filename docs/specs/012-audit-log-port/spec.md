---
id: 012-audit-log-port
status: done              # draft | approved | in-progress | done
requirements: [NFR4]
adrs: [0002, 0006]
---

# 012 — Auditoría de operaciones en la capa de aplicación

## Problema
NFR4 exige registrar cada creación, deshabilitación y habilitación de devices y groups: quién, cuándo y con qué
resultado. Hoy cada adaptador HTTP emite su propia línea de auditoría (004, 005, 006). La clasificación del resultado
de negocio queda acoplada al transporte, el mismo bloque se repite en tres controllers y una operación que no entre
por HTTP quedaría sin auditar. Además, el código incumple `coding.md` › "Auditoría de operaciones", que ya asigna la
auditoría al use case (ADR-0006, aceptado). Este spec lleva la auditoría ahí sin cambiar el comportamiento observable.

## Alcance
- Incluye:
  - El mecanismo transversal de auditoría (registro y medición de duración) según ADR-0006 y `coding.md`.
  - Migrar las cuatro operaciones existentes: `group.create`, `device.register`, `device.disable` y `device.enable`.
  - Un helper común para el patrón medir → clasificar → registrar → relanzar, ya que lo usan cuatro operaciones.
- **No incluye**:
  - El log del webhook de ingesta (008): es un log operativo, no una operación de NFR4. Se queda como está.
  - Cambios en los contratos HTTP de `POST /groups`, `POST /devices` y `POST /devices/:deviceId/{disable,enable}`.
  - Persistir la auditoría o enviarla a otro destino distinto del log estructurado.
  - Cambios en ADR-0002, en el log de request de pino-http o en el log de comandos a Traccar.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO termine una ejecución de cualquiera de las cuatro operaciones, el sistema DEBE emitir **exactamente
  una** línea de auditoría con `msg` = `op`, `op`, `actor`, `result`, `durationMs` y `context: "Audit"`, sea cual sea el
  punto de entrada. Los adaptadores de entrada NO DEBEN emitir líneas de auditoría.
- **AC-2** — `group.create`: con `created` o `existing` la línea DEBE ser `info` e incluir `name` y `groupId`; con
  `ambiguous` o `failed` DEBE ser `warn`, incluir `name` y no incluir `groupId`.
- **AC-3** — `device.register`: con `created`, `existing` o `retired-and-created` la línea DEBE ser `info` e incluir
  `uniqueId`, `groupId` y `deviceId` (más `retiredDeviceId` si se retiró uno); con `conflict` o `failed` DEBE ser `warn`,
  incluir `uniqueId` y `groupId` y no incluir `deviceId`.
- **AC-4** — `device.disable` / `device.enable`: con `changed` o `unchanged` la línea DEBE ser `info`; con `retired`,
  `not-found` o `failed` DEBE ser `warn`. Siempre incluye `deviceId`.
- **AC-5** — `durationMs` DEBE ser un entero ≥ 0 que mide la ejecución completa de la operación, incluidas las
  llamadas a Traccar.
- **AC-6** — SI no hay actor identificado, ENTONCES la línea DEBE emitirse igualmente, sin `actor`.
- **AC-7** — SI falla la emisión de la línea de auditoría, ENTONCES la operación DEBE completarse con su resultado
  normal.
- **AC-8** — SI la operación termina en rechazo de negocio o error, ENTONCES el error original DEBE propagarse sin
  modificar (mismas respuestas HTTP que hoy).
- **AC-9** — La línea NO DEBE contener tokens, headers, el body de la petición ni campos fuera de los definidos en
  `coding.md`. Los ids de negocio no pueden sobrescribir los campos fijos (`msg`, `op`, `actor`, `result`,
  `durationMs`).
- **AC-10** — Los contratos HTTP de 004, 005 y 006 DEBEN mantenerse: sus suites e2e siguen en verde sin cambios en las
  aserciones de status y body.

## Contratos externos
- Ninguno nuevo. La línea sale por stdout con el formato de ADR-0002 §4 y los campos de `coding.md`.
- Cambio observable menor en logs: `context` pasa del nombre del controller a `"Audit"`, y `durationMs` deja de
  incluir la validación HTTP.

## Preguntas abiertas
_Ninguna._ Resueltas 2026-10-15 con el usuario:
1. ADR-0006 aceptado.
2. El log del webhook (008) queda fuera de este spec.
3. Alcance: migrar el código de las cuatro operaciones existentes (005 y 006 ya están implementados).
