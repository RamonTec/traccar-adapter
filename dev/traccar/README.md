# Traccar local (desarrollo)

Instancia de Traccar **6.15.3** solo para este proyecto, aislada de otras instalaciones.

```bash
docker compose up -d          # web: http://localhost:18082 · OsmAnd: localhost:15055
docker compose down           # los datos quedan en el volumen traccar-data
```

- Configuración: `dev/traccar/traccar.xml` (montado read-only). `registerUnknown=true`.
- Forward de posiciones a `http://host.docker.internal:3000/webhooks/traccar/positions` y de eventos a
  `…/events`, con `Authorization: Bearer dev-webhook-token-0123456789` (solo desarrollo: arranca el adapter con
  `WEBHOOK_TOKEN=dev-webhook-token-0123456789`). Otros destinos: `TRACCAR_FORWARD_URL` / `TRACCAR_EVENT_FORWARD_URL`.
- Reintentos del forward de posiciones (`forward.retry.*`): ver `docs/ops/traccar-config.md`. Para experimentos,
  `TRACCAR_FORWARD_RETRY_DELAY` / `TRACCAR_FORWARD_RETRY_COUNT`.
- Puertos de host configurables con `TRACCAR_WEB_PORT` / `TRACCAR_OSMAND_PORT` (por defecto fuera del
  rango 50xx para no chocar con un Traccar en red host).
- El primer usuario registrado en la web es admin. El token de API va en `.env.local` (no versionado).
- Captura de fixtures: ver `test/fixtures/traccar/README.md` (profile `capture`).
