# ADR-0007 — Outbox local de entrega cuando JetStream no está disponible

- Estado: propuesto
- Fecha: 2026-10-15
- Alcance: **servicio** (traccar-adapter). Complementa ADR-0004 (contrato y dedup) y modifica ADR-0005 §5.
- Excepción acotada al principio *stateless* del planning (§ "Stateless by design").

## Contexto
ADR-0005 §5 asume que, si el adapter responde `503` porque no puede publicar en JetStream, Traccar reintenta. Las
verificaciones de 008-T07 sobre Traccar 6.15.3 (código fuente y experimento, `docs/ops/traccar-config.md`) muestran que:

- **Los eventos no se reintentan nunca**: un `503` en `/webhooks/traccar/events` pierde el evento (incluidas alarmas).
- Las posiciones solo se reintentan con `forward.retry.enable=true` (desactivado por defecto), con una ventana finita
  (`delay × (2^count − 1)`, ≈17 min recomendado) y un límite de pendientes. Al agotarla, Traccar lanza un
  `NullPointerException` y no genera los eventos derivados de esa posición.
- El dead-letter también vive en JetStream: con NATS caído, un payload inválido tampoco se puede guardar (FR10).

Por tanto, una indisponibilidad de NATS, aunque sea breve, pierde datos aunque el adapter esté sano.

## Decisión
1. **Outbox de entrega local, solo como respaldo.** El adapter intenta publicar en JetStream; **solo si falla por
   indisponibilidad** guarda el mensaje ya construido (subject, headers incluido `Nats-Msg-Id`, bytes) en un buffer
   local duradero y responde `200` a Traccar. En condiciones normales no se escribe en disco.
2. **Garantía de respuesta**: un `200` solo se devuelve si el mensaje tiene PubAck de JetStream **o** está escrito de
   forma sincronizada en el buffer. Si el buffer tampoco puede escribir (lleno, disco), se responde `503` como hoy.
3. **Drenado** en segundo plano: publica los pendientes en orden de llegada, con backoff, y **borra cada fila tras su
   PubAck**. El buffer solo contiene pendientes; no hay estado `isSent` ni histórico.
4. **Orden**: mientras haya pendientes, los mensajes nuevos se encolan detrás (no se publican directamente), para no
   reordenar el flujo por device.
5. **Duplicados**: un reenvío cuyo PubAck original se perdió lo absorbe la deduplicación de JetStream dentro de
   `duplicate_window`; fuera de ella, los consumidores deduplican por `id` (ADR-0004).
6. **Tecnología**: SQLite embebido mediante `node:sqlite` (Node 24, sin dependencias nuevas), un archivo por réplica
   en un volumen persistente, modo WAL y `synchronous=FULL`. Límite de pendientes configurable.
7. **Lo que NO es**: ni almacenamiento de telemetría, ni consultable, ni compartido entre réplicas. Un mensaje vive
   en el buffer solo hasta su PubAck. La regla de `AGENTS.md` pasa a ser: *sin BD de negocio; solo el buffer local de
   entrega de ADR-0007*.

## Alternativas consideradas
- **Aceptar el riesgo** (solo documentar): sin coste, pero pierde alarmas en cualquier corte de NATS.
- **Reintento en memoria antes del `503`**: cubre cortes de segundos; no sobrevive a un reinicio ni a cortes largos.
- **Outbox siempre (escribir antes de publicar)**: más simple de razonar, pero añade una escritura síncrona a disco
  a cada mensaje en el camino normal.
- **Leaf node de NATS con JetStream junto al adapter**: solución nativa de NATS (el adapter publica en local y el
  leaf replica al clúster). No requiere código, pero añade un servidor NATS por réplica que operar y configurar.

## Consecuencias
- (+) Una caída de NATS ya no pierde posiciones, eventos ni dead-letters mientras el buffer tenga espacio.
- (+) Las posiciones dejan de depender de la ventana de reintentos de Traccar y de su `NullPointerException` cuando
  el fallo es de NATS.
- (−) El despliegue pasa a tener estado: un volumen persistente por réplica (p.ej. StatefulSet). Perder el volumen
  pierde los pendientes.
- (−) Hay que vigilar la profundidad del buffer (pendientes y antigüedad del más viejo).
- (=) **No cubre** la caída del propio adapter: para eso, al menos 2 réplicas con despliegue escalonado y la
  reconciliación del spec 011.
- Al aceptar este ADR: actualizar la regla *stateless* de `AGENTS.md` y la sección correspondiente del planning.
