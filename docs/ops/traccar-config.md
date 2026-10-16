# Configuración de Traccar para traccar-adapter

Versión verificada: **Traccar 6.15.3**. Decisiones de origen: [ADR-0005](../decisions/0005-traccar-integration.md),
[ADR-0004](../decisions/0004-telemetry-event-contract.md). Entorno local reproducible: [`dev/traccar/`](../../dev/traccar/README.md).

## 1. `traccar.xml` de referencia

```xml
<!-- El reenvío se activa con la presencia de la URL: 6.15.3 NO tiene forward.enable,
     forward.json ni event.forward.enable (si aparecen en un traccar.xml, se ignoran). -->
<entry key='forward.type'>json</entry>
<entry key='forward.url'>http://<adapter>:<port>/webhooks/traccar/positions</entry>
<entry key='forward.header'>Authorization: Bearer ${WEBHOOK_TOKEN}</entry>

<entry key='forward.retry.enable'>true</entry>
<entry key='forward.retry.delay'>1000</entry>
<entry key='forward.retry.count'>10</entry>
<entry key='forward.retry.limit'>10000</entry>

<entry key='event.forward.type'>json</entry>
<entry key='event.forward.url'>http://<adapter>:<port>/webhooks/traccar/events</entry>
<entry key='event.forward.header'>Authorization: Bearer ${WEBHOOK_TOKEN}</entry>

<entry key='database.registerUnknown'>false</entry>
```

`${WEBHOOK_TOKEN}` es el mismo valor que la variable `WEBHOOK_TOKEN` del adapter (≥ 16 caracteres). Las rutas
coinciden con `TraccarWebhookController` (`POST /webhooks/traccar/positions` y `/events`), públicas para JWT pero
protegidas por el token compartido.

### Claves de reintento (verificadas)
Fuente: `src/main/java/org/traccar/config/Keys.java` y `handler/PositionForwardingHandler.java` del tag
[`v6.15.3`](https://github.com/traccar/traccar/tree/v6.15.3), y el binario `tracker-server.jar` de la imagen
`traccar/traccar:6.15.3`.

| Clave | Por defecto | Recomendado | Significado |
|-------|-------------|-------------|-------------|
| `forward.retry.enable` | `false` | `true` | Sin esto, un fallo del adapter **pierde la posición** en el primer intento. |
| `forward.retry.delay` | `100` ms | `1000` | Primer retardo. Backoff exponencial: el intento *n* espera `delay × 2^(n-1)`. |
| `forward.retry.count` | `10` | `10` | Reintentos máximos. |
| `forward.retry.limit` | `100` | `10000` | Posiciones pendientes máximas; por encima de este número **no se reintenta**. |
| `forward.connectTimeout` / `forward.writeTimeout` | — | — | Existen en 6.15.3; no se ajustan. |

Cualquier respuesta no-2xx o error de red cuenta como fallo. El adapter responde `200` cuando el mensaje está
publicado en JetStream, guardado en su outbox local porque NATS no está disponible (ADR-0007) o en el dead-letter.
Solo responde `503` si ni JetStream ni el outbox pueden aceptarlo (outbox lleno o error de disco).

**Los eventos (`event.forward.*`) no tienen reintentos** en 6.15.3: el reintento solo existe en
`PositionForwardingHandler`. Ver §3.

## 2. Gestión solo a través del adapter (ADR-0005 §7)
- Groups y devices se crean, mueven, renombran o deshabilitan **solo** con traccar-adapter. Solo su usuario de
  servicio tiene permisos de escritura.
- Las cuentas humanas, si existen, son de solo lectura (`readonly` / `deviceReadonly`).
- El puerto web de Traccar (8082) no se expone fuera de la red interna.
- Uso de emergencia: solo un admin, y cualquier cambio manual se informa a core-service para conciliar datos.

## 3. Caída máxima tolerable del adapter

**Fórmula** (código de 6.15.3): ventana = `delay × (2^count − 1)`.
Con la configuración recomendada: `1000 ms × 1023` ≈ **17 min**. Con los valores por defecto y los reintentos
activados: `100 ms × 1023` ≈ 1,7 min. Sin `forward.retry.enable`: **0 s**.

**Experimento** (2026-10-15, Traccar 6.15.3 local con `docker compose`, OsmAnd, receptor `capture` detenido
durante la caída, `forward.retry.delay=200`, `forward.retry.count=5` → ventana teórica 6,2 s):

| Prueba | Caída | Enviadas | Recibidas | Observación |
|--------|-------|----------|-----------|-------------|
| A | 3 s | 3 posiciones | 3 | Dentro de la ventana: llegan todas con el reintento. |
| B | 12 s | 3 posiciones | 0 | Fuera de la ventana: se pierden para el adapter. |
| C | 2 s | 1 posición + alarma SOS | posición + evento `alarm` | El evento se genera **después** de que el reenvío de su posición termina. |
| D | 15 s | 1 posición + alarma SOS | nada | Al agotar los reintentos Traccar lanza `NullPointerException` (`AttributeUtil:51 < PositionForwarderJson:51 < PositionForwardingHandler:80`) y **no genera el evento `alarm`**. |

En B y D las posiciones **sí quedan guardadas** en la base de datos de Traccar (`GET /api/positions`), así que la
reconciliación por polling (spec 011) puede recuperarlas. Los eventos de D no existen en ninguna parte.

**Riesgos que quedan abiertos** (ADR-0005 §5 enmendado por ADR-0007, spec 011). Una caída de **NATS** ya no pierde
datos mientras el outbox tenga espacio. Siguen abiertos los de una caída del **propio adapter**:
1. Una caída mayor que la ventana pierde posiciones para JetStream (no en Traccar) y sus eventos derivados.
2. Cualquier **evento** que llegue con el adapter caído (o con el outbox lleno, `503`) se pierde: Traccar no lo
   reintenta. Mitigación: ≥ 2 réplicas con despliegue escalonado.
3. Más de `forward.retry.limit` posiciones pendientes: las nuevas no se reintentan.

## 4. Diferencias con la configuración local heredada
La instancia que ya existía en desarrollo (fuera de este repo) tiene:
- `forward.url` y `event.forward.url` apuntando a una sola URL heredada `http://localhost:3123/api/gps/webhook`.
  El adapter usa dos rutas distintas (`/webhooks/traccar/positions` y `/events`).
- `forward.enable`, `forward.json` y `event.forward.enable`, que en 6.15.3 no existen y se ignoran.
- `database.registerUnknown=true`: en entornos compartidos debe ser `false`.
- El token del webhook escrito en texto plano en `traccar.xml`: debe venir de un secreto gestionado y coincidir
  con `WEBHOOK_TOKEN`.
- Sin `forward.retry.*`: cualquier caída del receptor pierde datos.
