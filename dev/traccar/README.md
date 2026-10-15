# Traccar local (desarrollo)

Instancia de Traccar **6.15.3** solo para este proyecto, aislada de otras instalaciones.

```bash
docker compose up -d          # web: http://localhost:18082 · OsmAnd: localhost:15055
docker compose down           # los datos quedan en el volumen traccar-data
```

- Configuración: `dev/traccar/traccar.xml` (montado read-only). `registerUnknown=true`.
- Forward de posiciones y eventos a `http://host.docker.internal:3123/api/gps/webhook` con
  `Authorization: Bearer dev-webhook-token` (solo desarrollo). Otro destino: `TRACCAR_FORWARD_URL=...`.
- Puertos de host configurables con `TRACCAR_WEB_PORT` / `TRACCAR_OSMAND_PORT` (por defecto fuera del
  rango 50xx para no chocar con un Traccar en red host).
- El primer usuario registrado en la web es admin. El token de API va en `.env.local` (no versionado).
- Captura de fixtures: ver `test/fixtures/traccar/README.md` (profile `capture`).
