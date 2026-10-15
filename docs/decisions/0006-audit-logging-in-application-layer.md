# ADR-0006 — Auditoría de operaciones en la capa de aplicación vía port

- Estado: propuesto
- Fecha: 2026-10-15
- Alcance: **servicio** (traccar-adapter). El formato de línea sigue ADR-0002 §4.

## Contexto
El spec 004 (T05) puso la línea de auditoría `group.create` en el controller, con un `try/finally` que mide la duración y clasifica el resultado (`created|existing|ambiguous|failed`). Eso tiene tres problemas:

- El controller, que es un adaptador de entrada HTTP, decide la semántica de negocio del resultado. Para distinguir `ambiguous` de `failed` tiene que conocer `GroupNameAmbiguousError`.
- Las operaciones que no entran por HTTP no quedarían auditadas: webhooks de Traccar (008) y mensajes NATS. Habría que repetir el mecanismo en cada adaptador de entrada.
- Los specs 005 y 006 copian el mismo bloque en sus controllers.

Se evaluaron dos alternativas:

| | Port en application | Interceptor de Nest |
|---|---|---|
| Quién clasifica el resultado | El use case, que ya lo conoce | El interceptor, a partir de códigos de error mapeados aparte |
| Entradas no HTTP | Auditadas igual | Requieren otro mecanismo |
| Dependencias | application → port propio; infrastructure lo implementa | Solo infrastructure, pero acoplado a HTTP |
| Test | Unit con fake del port | Integración con Nest |

## Decisión
1. La auditoría de una operación es responsabilidad del **use case**. Se emite a través de un port transversal; los controllers y demás adaptadores de entrada no auditan.
2. Ports transversales en `src/shared/application/ports/`:
   ```ts
   // audit-log.port.ts
   export const AUDIT_LOG_PORT = Symbol('AuditLogPort');
   export interface AuditEvent {
     readonly op: string;                        // '<recurso>.<acción>'
     readonly actor: string | undefined;
     readonly result: string;                    // enum propio de la operación
     readonly succeeded: boolean;                // decide el nivel; no se loguea como campo
     readonly durationMs: number;                // entero
     readonly fields: Readonly<Record<string, string | number>>; // ids de negocio presentes
   }
   export interface AuditLogPort { record(event: AuditEvent): void }

   // clock.port.ts
   export const CLOCK_PORT = Symbol('ClockPort');
   export interface ClockPort { now(): number }  // ms monotónicos, solo para medir duraciones
   ```
3. Adapters en `src/shared/infrastructure/audit/`:
   - `PinoAuditLogAdapter` emite una línea con `msg = op`, `op`, `actor`, `result`, `durationMs` y los `fields` expandidos. Usa `context: 'Audit'`, nivel `info` si `succeeded` y `warn` si no. **Nunca lanza**: un fallo al auditar no puede romper la operación.
   - `SystemClock` usa `performance.now()`.
   - `AuditModule` es `@Global()`, provee `AUDIT_LOG_PORT` y `CLOCK_PORT` y se importa una vez en `AppModule`.
4. El `actor` entra al use case como parte de su input (`actor: string | undefined`). El adaptador de entrada lo obtiene del transporte, p.ej. con `@Actor()` desde el JWT.
5. Patrón en el use case: `start = clock.now()`; `try { … result = 'created' … } catch (e) { result = <rechazo con nombre> | 'failed'; throw e } finally { audit.record(…) }`. El error se relanza sin tocar. Si dos o más use cases repiten el patrón (005, 006), se extrae un helper puro en `shared/application`. Ese helper no es parte de esta decisión.

## Consecuencias
- (+) Los controllers solo traducen transporte ↔ use case: validan, pasan `actor` y mapean el resultado a status HTTP.
- (+) Toda operación queda auditada igual, entre por HTTP, webhook o NATS.
- (+) La auditoría se prueba con tests unitarios, sin Nest, mediante un fake de `AuditLogPort` y un `ClockPort` controlado.
- (−) Cada use case auditado recibe dos dependencias más (`AuditLogPort`, `ClockPort`) y `actor` en su input.
- (−) Cambia trabajo ya hecho: 004 (`done`) audita en el controller. El spec **012-audit-log-port** implementa esta decisión, refactoriza `group.create` y ajusta los designs/tasks de 005, 006 y el log de 008 antes de que se implementen.
- La línea de auditoría sigue siendo distinta del log de request de pino-http y del log de cada comando a Traccar (`coding.md` › Logging).
