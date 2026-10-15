---
id: 013-delivery-outbox
status: draft          # draft | approved | in-progress | done
requirements: [FR9, FR10, NFR2, NFR6]
adrs: [0004, 0005, 0007]
---

# 013 — Outbox local de entrega

## Problema
Con NATS no disponible, el webhook responde `503` y confía en que Traccar reintente. Traccar 6.15.3 **no reintenta
los eventos** y solo reintenta las posiciones durante una ventana finita (008-T07). El resultado: un corte de NATS
pierde alarmas, posiciones y dead-letters aunque el adapter esté sano (ADR-0007).

## Alcance
- Incluye: guardar en un buffer local duradero los mensajes (eventos y dead-letters) que no se pudieron publicar en
  JetStream, drenarlos cuando NATS vuelva, límites, configuración y observabilidad del buffer.
- **No incluye**: la caída del propio adapter (réplicas, spec 011); consultar ni exponer el contenido del buffer;
  almacenar telemetría (planning, "Explicitly out of scope"); compartir el buffer entre réplicas.

## Comportamiento (criterios de aceptación)
- **AC-1** — CUANDO publicar un evento normalizado falla porque JetStream no está disponible, el sistema DEBE guardarlo
  en el buffer local y el webhook DEBE responder `200` con `outcome: "buffered"`.
- **AC-2** — CUANDO publicar un dead-letter falla porque JetStream no está disponible, el sistema DEBE guardarlo en el
  buffer local con los bytes originales del payload, y responder `200`.
- **AC-3** — El sistema DEBE responder `200` solo si el mensaje tiene confirmación de JetStream o está escrito de forma
  duradera en el buffer.
- **AC-4** — SI el buffer no puede guardar el mensaje (límite alcanzado o error de escritura), ENTONCES el webhook DEBE
  responder `503 UPSTREAM_UNAVAILABLE` y registrar el motivo.
- **AC-5** — CUANDO JetStream vuelve a estar disponible, el sistema DEBE publicar los pendientes en orden de llegada,
  con el mismo subject, `Nats-Msg-Id` y headers que habría tenido la publicación original, y eliminarlos tras la
  confirmación.
- **AC-6** — SI la publicación de un pendiente falla, ENTONCES DEBE seguir pendiente y reintentarse con backoff, sin
  bloquear la recepción de nuevos webhooks.
- **AC-7** — MIENTRAS haya pendientes, los mensajes nuevos DEBEN encolarse detrás de ellos en lugar de publicarse
  directamente.
- **AC-8** — CUANDO el proceso arranca con pendientes de una ejecución anterior, el sistema DEBE drenarlos.
- **AC-9** — Reenviar un pendiente que JetStream ya había confirmado NO DEBE crear un duplicado dentro de su ventana
  de deduplicación.
- **AC-10** — La ruta del buffer y su límite DEBEN ser configurables; un valor inválido DEBE impedir el arranque
  nombrando la variable.
- **AC-11** — El sistema DEBE exponer el número de pendientes y la antigüedad del más viejo, y registrar en logs cada
  mensaje guardado y drenado (`id`, `kind`, motivo), sin el payload ni el token.

## Contratos externos
- Webhook (008): `outcome` admite el nuevo valor `buffered`.
- Variables de entorno nuevas: ruta del archivo del buffer y límite de pendientes.
- Despliegue: un volumen persistente por réplica para el archivo del buffer.

## Preguntas abiertas
1. **Readiness con NATS caído y buffer operativo**: ¿`ready` (aceptar tráfico) con `nats: "down"` y la profundidad
   del buffer, o fallar el readiness? Propuesta: `ready` mientras el buffer acepte escrituras.
2. **Límites por defecto**: número máximo de pendientes y/o tamaño del archivo (propuesta: 100 000 mensajes o
   512 MiB), y si hace falta antigüedad máxima.
3. **Despliegue**: confirmar con infraestructura el volumen persistente por réplica (p.ej. StatefulSet).
4. **ADR-0007** debe quedar aceptado antes de aprobar este spec (cambia la regla *stateless* de `AGENTS.md` y del
   planning).
