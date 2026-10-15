---
id: 008-T07
status: done           # todo | doing | blocked | done
depends_on: [008-T06]
covers: [AC-11]
---

# 008-T07 — Document required Traccar configuration

## Objetivo
Documentar qué configuración de Traccar necesita el adapter y cuánto tiempo puede estar caído sin perder datos (ADR-0005 §5).

## Contexto (leer SOLO esto)
- `docs/decisions/0005-traccar-integration.md`
- `docs/sdd/skills/traccar-api/reference.md` (si existe; de 003-T01)

## Contrato (contenido mínimo de `docs/ops/traccar-config.md`)
1. Bloque `traccar.xml` de referencia, **sin secretos** (`${WEBHOOK_TOKEN}` como marcador):
   - `forward.enable=true`, `forward.json=true`, `forward.url=http://<adapter>:<port>/webhooks/traccar/positions`, `forward.header=Authorization: Bearer ${WEBHOOK_TOKEN}`;
   - `event.forward.enable=true`, `event.forward.url=…/webhooks/traccar/events`, `event.forward.header=…`;
   - `database.registerUnknown=false`;
   - claves de reintento del reenvío: nombre exacto, valor por defecto y valor recomendado. **Verificar los nombres** en la documentación oficial de configuración de Traccar 6.x; las que no se puedan confirmar se marcan `NO VERIFICADO`.
2. Regla ADR-0005 §7: la gestión se hace solo a través del adapter, las cuentas humanas son de solo lectura y el puerto web es interno.
3. **Caída máxima tolerable**: resultado de un experimento hecho por una persona (detener el adapter, enviar N posiciones por OsmAnd cada X s, levantarlo y contar las recibidas frente a las enviadas), con la fecha y los parámetros usados.
4. Diferencias con la configuración local actual (URL heredada `:3123/api/gps/webhook`, `registerUnknown=true`, token en texto plano).

## Archivos a crear/modificar
- [x] `docs/ops/traccar-config.md` (nuevo)
- [x] `dev/traccar/traccar.xml`, `dev/traccar/README.md`, `docker-compose.yml`: alineados con las rutas reales y las claves de 6.15.3 (añadido)
- [x] `README.md`: enlace a la guía

## Criterios de aceptación
- [x] **AC-11a** — Las URLs de reenvío y los headers coinciden con las rutas reales del controller (T06).
- [x] **AC-11b** — Las claves de reintento están verificadas o marcadas `NO VERIFICADO`, con la fuente citada.
- [x] **AC-11c** — La caída máxima tolerable está medida, o el task queda `blocked` hasta que una persona haga el experimento.
- [x] **AC-11d** — Ningún token, contraseña ni IMEI real en el documento.

## Fuera de alcance
- Cambiar la configuración de Traccar (lo hace una persona).

## Verificación
```bash
pnpm check
```

## Handoff
- `docs/ops/traccar-config.md`: claves verificadas en el fuente/binario 6.15.3 (no existen `forward.enable`, `forward.json`, `event.forward.enable`); reintentos solo para posiciones, backoff `delay×2^n`.
- AC-11c: ventana = `delay×(2^count−1)` (≈17 min recomendado), medida por el agente en el Traccar local (pruebas A–D); falta la revisión humana del documento.
- Riesgos abiertos: eventos sin reintento (un 503 a /events se pierde) y NPE de Traccar al agotar los reintentos (no se genera el evento derivado).
- `dev/traccar` + compose alineados con `/webhooks/traccar/{positions,events}` en :3000.
