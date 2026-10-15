---
id: 008-T05
status: done           # todo | doing | blocked | done
depends_on: [008-T01]
covers: [AC-1]
---

# 008-T05 — Add WebhookTokenGuard

## Objetivo
Rechazar con `401` cualquier llamada al webhook que no traiga el token compartido de Traccar, comparando en tiempo constante y sin loguear el valor.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts` (solo `APP_CONFIG` y `WebhookConfig`)
- skill `automated-testing` (`recipes.md` §4)

## Contrato
```ts
// src/modules/ingestion/infrastructure/inbound/webhook-token.guard.ts
@Injectable()
export class WebhookTokenGuard implements CanActivate {
  private readonly logger = new Logger(WebhookTokenGuard.name);
  constructor(@Inject(APP_CONFIG) config: AppConfig) {}       // precalcula sha256(config.webhook.token)
  canActivate(ctx: ExecutionContext): boolean;
  // header 'authorization' debe ser 'Bearer <token>'; compara timingSafeEqual(sha256(recibido), esperado)
  // fallo → logger.warn({ reason: 'missing' | 'mismatch' }, 'Rejected webhook token'); throw new UnauthorizedException()
}
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/infrastructure/inbound/webhook-token.guard.ts` (nuevo)
- [ ] `src/modules/ingestion/infrastructure/inbound/webhook-token.guard.spec.ts` (nuevo, unit con `ExecutionContext` fake)

## Criterios de aceptación
- [ ] **AC-1a** — Header correcto → `true`.
- [ ] **AC-1b** — Sin header, con `Basic …`, con un token incorrecto de la misma longitud y con un token de otra longitud → `UnauthorizedException`, sin lanzar errores de `timingSafeEqual` por longitudes distintas.
- [ ] **AC-1c** — El log `warn` contiene `reason` y **no** contiene el token recibido ni el esperado.

## Fuera de alcance
- Registrarlo en el controller (T06).

## Verificación
```bash
pnpm vitest run src/modules/ingestion/infrastructure
pnpm check
```

## Handoff
- `WebhookTokenGuard`: `Authorization: Bearer <token>`; compara `timingSafeEqual` sobre sha256 (longitudes iguales siempre).
- Fallo → `warn({reason: 'missing'|'mismatch'}, 'Rejected webhook token')` + 401; nunca loguea tokens.
