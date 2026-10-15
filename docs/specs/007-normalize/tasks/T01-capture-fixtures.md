---
id: 007-T01
status: done           # todo | doing | blocked | done
depends_on: []
covers: [AC-10]
---

# 007-T01 — Capture real Traccar forward fixtures

## Objetivo
Tener payloads **reales** del reenvío de Traccar 6.15.3, una posición con group, una sin group y un evento de alarma, para que la normalización se diseñe sobre datos observados.

## Contexto (leer SOLO esto)
- Nada del repo. Datos del entorno local:
  - Traccar (red del host) reenvía posiciones y eventos a `http://localhost:3123/api/gps/webhook` (ya configurado; **no** tocar `traccar.xml`).
  - El protocolo OsmAnd escucha en `localhost:5055` (puerto por defecto). `database.registerUnknown=true` en local, así que el device se crea solo.

## Contrato
```js
// scripts/capture-traccar-forward.mjs — node:http en el puerto 3123 (CAPTURE_PORT opcional)
// Por cada POST: guarda en test/fixtures/traccar/captured/<n>-<kind>.json el body formateado.
//   kind = 'event' si el JSON tiene la clave "event", si no 'position'.
// NUNCA guarda headers. Responde 200. Ctrl+C para salir.
```
Pasos:
1. `node scripts/capture-traccar-forward.mjs`
2. Posición sin group: `curl "http://localhost:5055/?id=356938035643809&lat=-16.5&lon=-68.15&speed=10&timestamp=$(date +%s)"`
3. **Persona**: en la web de Traccar (solo en local), asignar ese device a un group de prueba.
4. Posición con group: repetir el paso 2 con otras coordenadas.
5. Alarma: repetir el paso 2 añadiendo `&alarm=sos`. Comprobar que llega un payload con la clave `event`; si no llega, anotarlo en el Handoff con lo observado.
6. Copiar los capturados y anonimizarlos (IMEI → `000000000000001`, nombres → `device-1`, `group-1`) en:
   `test/fixtures/traccar/position.json`, `position-no-group.json`, `event-alarm.json`.

## Archivos a crear/modificar
- [x] `scripts/capture-traccar-forward.mjs` (nuevo)
- [x] `test/fixtures/traccar/position.json`, `position-no-group.json`, `event-alarm.json` (nuevos, anonimizados)
- [x] `test/fixtures/traccar/README.md` (nuevo): versión de Traccar, fecha, pasos y qué se anonimizó
- [x] `.gitignore`: añadir `test/fixtures/traccar/captured/`
- [x] `docker-compose.yml`, `dev/traccar/traccar.xml`, `dev/traccar/README.md` (añadidos con aprobación del usuario 2026-10-15: Traccar 6.15.3 exclusivo del proyecto + profile `capture`)

## Criterios de aceptación
- [x] **AC-10a** — Los tres fixtures existen, son JSON válido y provienen de capturas reales: el README dice cuándo y con qué versión.
- [x] **AC-10b** — `position-no-group.json` muestra el valor real de `device.groupId` sin group (`0` o `null`; documentar cuál).
- [x] **AC-10c** — En los fixtures no aparecen el IMEI usado, el token del webhook ni nombres reales (`grep` del IMEI → vacío).
- [x] **AC-10d** — El README lista los campos observados en `position`, `device` y `event`, con sus tipos y el formato de fecha.

## Fuera de alcance
- Código de normalización (T03, T04). Cambiar la configuración de Traccar.

## Verificación
```bash
node -e "for (const f of ['position','position-no-group','event-alarm']) JSON.parse(require('fs').readFileSync('test/fixtures/traccar/'+f+'.json'))"
pnpm check
```

## Handoff
- Fixtures reales Traccar 6.15.3 (2026-10-15) anonimizados + README con campos/tipos; sin group → `groupId: 0`.
- Entorno: `docker-compose.yml` (Traccar 6.15.3 en 18082/15055 + profile `capture`), `dev/traccar/`.
- **Hallazgo**: `position.id` = 0 siempre en el forward de posiciones → Q1 en spec.md; T03 bloqueado hasta decidir el id.
- La alarma SOS genera 2 POST (posición con `attributes.alarm` + evento `alarm`).
