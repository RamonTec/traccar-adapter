---
id: 012-audit-log-port
status: draft          # draft | approved | in-progress | done
requirements: [NFR4]
adrs: [0002, 0006]
---

# 012 — Auditoría de operaciones en la capa de aplicación

## Problema
NFR4 exige registrar cada creación, deshabilitación y habilitación de devices y groups: quién, cuándo y con qué resultado. Hoy la auditoría de `group.create` (004) la emite el adaptador HTTP. Eso tiene dos consecuencias:
- La clasificación del resultado de negocio queda acoplada al transporte.
- Una operación que no entre por HTTP quedaría sin auditar.

ADR-0006 decide que la auditoría pertenece a la capa de aplicación. Este spec la lleva ahí sin cambiar el comportamiento observable, y alinea los specs aún no implementados (005, 006).

## Alcance
- Incluye:
  - El mecanismo transversal de auditoría de operaciones (registro y medición de duración) según ADR-0006 y `coding.md` › "Auditoría de operaciones".
  - Migrar la auditoría de `group.create` a ese mecanismo.
  - Actualizar design/tasks de 005 y 006 para que auditen igual.
- **No incluye**:
  - Cambios en el contrato HTTP de `POST /groups` (status, body, errores).
  - Persistir la auditoría o enviarla a otro destino distinto del log estructurado: el servicio sigue sin estado.
  - Cambios en ADR-0002, que es de plataforma.
  - El log de request de pino-http y el log de comandos a Traccar.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO termine una ejecución de creación de group, el sistema DEBE emitir **exactamente una** línea de auditoría con `msg` = `op` = `"group.create"`, `actor`, `name`, `result` y `durationMs`, sea cual sea el punto de entrada.
- **AC-2** — CUANDO el resultado sea `created` o `existing`, la línea DEBE tener nivel `info` e incluir `groupId`.
- **AC-3** — SI la operación termina en rechazo de negocio (`ambiguous`) o error (`failed`), ENTONCES la línea DEBE tener nivel `warn`, no DEBE incluir `groupId` y el error original DEBE propagarse sin modificar (misma respuesta HTTP que hoy: 409 / 503).
- **AC-4** — `durationMs` DEBE ser un entero ≥ 0 que mide la ejecución de la operación completa, incluidas las llamadas a Traccar.
- **AC-5** — SI no hay actor identificado, ENTONCES la línea DEBE emitirse igualmente, sin `actor`.
- **AC-6** — SI falla la emisión de la línea de auditoría, ENTONCES la operación DEBE completarse con su resultado normal.
- **AC-7** — La línea de auditoría NO DEBE contener tokens, headers, el body de la petición ni campos fuera de los definidos en `coding.md` › "Auditoría de operaciones". Los campos fijos no pueden ser sobrescritos por ids de negocio.
- **AC-8** — MIENTRAS se atiende `POST /groups`, el contrato HTTP de 004 DEBE mantenerse: su suite e2e sigue en verde sin cambios en las aserciones de status y body.

## Contratos externos
- Ninguno nuevo. La línea de auditoría sale por stdout con el formato de ADR-0002 §4 y los campos de `coding.md` › "Auditoría de operaciones".
- No usa la API de Traccar más allá de lo que ya usa 004.

## Preguntas abiertas
1. **ADR-0006 está `propuesto`.** ¿Se acepta? Aprobar este spec lo requiere.
2. **Log de 008 (webhook ingest)** — Su línea `{kind, outcome, reason, durationMs}` es un log operativo de ingestión, no una operación de NFR4 (crear, deshabilitar o habilitar). Propuesta: dejarlo fuera de 012 y mantenerlo como está. ¿De acuerdo?
3. **005 y 006 están `approved`.** ¿Basta con actualizar su design y tasks dentro de 012 (sin código), o prefieres que cada uno incorpore el cambio en su propio ciclo?
