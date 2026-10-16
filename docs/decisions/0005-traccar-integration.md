# ADR-0005 — Integración con Traccar: autenticación, idempotencia, reuso de IMEI y fiabilidad del reenvío

- Estado: aceptado · §5 enmendado por [ADR-0007](0007-local-delivery-outbox.md) (2026-10-15)
- Fecha: 2026-10-13
- Alcance: traccar-adapter. Versión verificada: **Traccar 6.15.3**.

## Contexto
Hay que resolver las preguntas abiertas Q3 y Q4 del planning, el requisito NFR3 (idempotencia) y NFR2 (cola de reenvío en memoria). Además, Traccar exige que `uniqueId` sea único **también entre devices deshabilitados**, y eso choca con la regla "un IMEI reusado crea un device nuevo".

## Decisión
1. **Autenticación saliente (Q4)**: un usuario de servicio dedicado en Traccar con token de API y el header `Authorization: Bearer <TRACCAR_API_TOKEN>`. No se usa sesión ni contraseña. Los permisos del usuario se ajustan al mínimo que necesitan las operaciones. *(Validar en el spec del cliente Traccar que el token funciona en todos los endpoints usados.)*
2. **Header del webhook (Q3, verificado)**: `forward.header` para el reenvío de posiciones y `event.forward.header` para el de eventos, con el valor `Authorization: Bearer <WEBHOOK_TOKEN>`. Cada tipo se reenvía a **una URL distinta**.
3. **Idempotencia (NFR3) con claves naturales**, sin estado propio:
   - group: `name` es una clave externa opaca que da core-service. Crear es *get-or-create* por nombre exacto.
   - device: `uniqueId` (IMEI). Crear es *get-or-create*: si existe uno **habilitado en el mismo group**, se devuelve ese.
   - enable/disable: llevar el device al estado que ya tiene no es un error.
4. **Reuso de IMEI — retirar el device viejo**: si existe un device **deshabilitado** con ese `uniqueId`, antes de crear el nuevo se renombra su `uniqueId` a `<imei>:retired:<deviceId>`. Nunca se cambia su `groupId` (FR3). Un device retirado no se puede volver a habilitar.
5. **Reenvío y fiabilidad (NFR2) — riesgo aceptado para el MVP**: se ajustan `forward.retry.*` en `traccar.xml` y se documenta cuánto tiempo puede estar caído traccar-adapter sin perder datos. ~~El webhook responde **503** si no consigue publicar en JetStream, para que Traccar reintente.~~ *Enmendado: ver "Enmiendas".* La reconciliación por polling queda en el roadmap (spec 011), sin implementar.
6. **`database.registerUnknown` debe ser `false`** en todo entorno compartido: solo existen los devices que se crean a petición de core-service. Si llega una posición sin `groupId`, va al dead-letter con `MISSING_GROUP`.
7. **Gestión solo a través de traccar-adapter**: la interfaz web y la API de Traccar **no** se usan para crear, mover, renombrar ni borrar groups o devices. Solo el usuario de servicio de traccar-adapter tiene permisos de escritura. Las cuentas humanas, si existen, son de solo lectura (`readonly`/`deviceReadonly`). El puerto web de Traccar no se expone fuera de la red interna. Uso de emergencia: solo un admin, y cualquier cambio manual se informa a core-service para conciliar datos. Motivo: un cambio manual de group rompe FR3/NFR5 y desalinea la relación entre devices y groups que guarda core-service.

## Consecuencias
- (+) Se cumple NFR3 sin base de datos. Los reintentos de core-service son seguros.
- (+) El histórico del device viejo se conserva en Traccar y nunca cambia de group.
- (−) El get-or-create de groups tiene una ventana de carrera si llegan dos creaciones concurrentes con el mismo nombre. Es aceptable porque FR1 crea el group una única vez, en el onboarding.
- (−) La regla §7 es operativa: Traccar no impide técnicamente que un admin la incumpla. Se documenta en `docs/ops/traccar-config.md` (spec 008).
- (−) Una caída de traccar-adapter más larga que la ventana de reintentos de Traccar pierde datos hasta que exista el spec 011.

## Enmiendas
- **2026-10-15 — §5, por [ADR-0007](0007-local-delivery-outbox.md) (spec 013).** El supuesto "Traccar reintenta si
  respondemos 503" resultó falso para los eventos (nunca se reintentan) y limitado para las posiciones (ventana
  finita). Con JetStream no disponible, el webhook **guarda el mensaje en el outbox local y responde `200`**
  (`outcome: "buffered"`); el outbox lo publica al volver NATS. El webhook solo responde **`503`
  `UPSTREAM_UNAVAILABLE` si el outbox tampoco puede guardar** (lleno o error de escritura). El riesgo que sigue
  aceptado en §5 se reduce a la **caída del propio adapter** más allá de la ventana de reintentos de Traccar
  (posiciones) o a cualquier caída para los eventos; para eso siguen ≥ 2 réplicas y el spec 011 (diferido).
