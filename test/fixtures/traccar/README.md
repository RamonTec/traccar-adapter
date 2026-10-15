# Traccar forward fixtures

Payloads **reales** del reenvío JSON de Traccar (`forward.type=json`, `event.forward.url`),
capturados el **2026-10-15** con **Traccar 6.15.3** (`traccar/traccar:6.15.3`, ver `dev/traccar/README.md`)
y el protocolo OsmAnd.

| Fixture | Origen | Notas |
|---------|--------|-------|
| `position.json` | posición de un device asignado a un group | `device.groupId = 1` |
| `position-no-group.json` | posición de un device auto-registrado sin group | `device.groupId = 0` (no `null`) |
| `event-alarm.json` | `&alarm=sos` por OsmAnd | `event.type = "alarm"`, `event.attributes.alarm = "sos"` |

## Cómo se capturaron
1. `TRACCAR_FORWARD_URL=http://capture:3123/api/gps/webhook docker compose --profile capture up -d`
2. Posición: `docker compose exec traccar wget -qO- "http://localhost:5055/?id=<uniqueId>&lat=..&lon=..&speed=..&timestamp=<epoch>"`
3. Asignación del device a un group en la web de Traccar; repetir el paso 2 y añadir `&alarm=sos`.
4. `scripts/capture-traccar-forward.mjs` guarda cada body en `captured/` (gitignored, nunca headers).

## Anonimizado
`device.uniqueId` → `000000000000001`, `device.name` → `device-1`; en `position.json` y `event-alarm.json`
además `device.phone` → `+000000000`, `device.model` → `model-1`, `device.contact` → `contact-1`.
El resto de valores es el capturado.

## Observaciones clave
- **`position.id` es SIEMPRE `0`** en el forward de posiciones (y `device.positionId` es el de la posición
  anterior): Traccar reenvía antes de persistir. Los eventos sí traen `event.id` y `event.positionId`
  reales, y su `position.id` coincide con `event.positionId`. Ver Q1 en `docs/specs/007-normalize/spec.md`.
- Un mismo mensaje de alarma produce **dos** POST: la posición (con `attributes.alarm`) y el evento.
- Cada posición puede generar además eventos derivados (p.ej. `deviceMoving`).

## Campos observados
Fechas: string ISO-8601 con milisegundos y offset explícito, p.ej. `"2026-10-15T19:20:19.000+00:00"`.

**`position`** — `id` int (0 en forward de posición) · `attributes` object (`distance`, `totalDistance`,
`motion`, `alarm`…) · `deviceId` int · `protocol` string · `serverTime`/`deviceTime`/`fixTime` fecha ·
`valid` boolean · `latitude`/`longitude`/`altitude` number · `speed` number (**nudos**) · `course` number ·
`address` string|null · `accuracy` number · `network` object|null · `geofenceIds` int[]|null.

**`device`** — `id` int · `attributes` object · `groupId` int (**0 sin group**) · `calendarId` int ·
`name`/`uniqueId` string · `status` string · `lastUpdate` fecha · `positionId` int · `phone`/`model`/
`contact`/`category` string|null · `disabled` boolean · `expirationTime` fecha|null.

**`event`** (solo en eventos) — `id` int · `attributes` object · `deviceId` int · `type` string ·
`eventTime` fecha · `positionId` int · `geofenceId` int · `maintenanceId` int.
Un payload de evento trae también `position` (completa) y `device`.
