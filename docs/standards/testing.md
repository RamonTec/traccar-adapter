# Estándar: Testing

## Estrategia por capa

| Capa | Tipo | Herramienta | Dobles |
|------|------|-------------|--------|
| domain | unit | Vitest | ninguno |
| application (use cases) | unit | Vitest | **fakes** en memoria de los ports (clases escritas a mano, no mocks mágicos) |
| infrastructure/outbound | integración | Vitest + servidor HTTP falso / NATS de test | — |
| infrastructure/inbound | integración | `@nestjs/testing` + supertest | use case fake |
| flujo completo | e2e (`test/*.e2e-spec.ts`) | Vitest + supertest | Traccar y NATS falsos o en Docker |

## Reglas

- **Test primero**: cada `AC-n` del task se traduce primero a un test que falla, luego se implementa.
- Nombre del test referencia el AC: `it('AC-2: rejects IMEI with non-digit chars', ...)`.
- Unit tests colocados junto al archivo: `register-device.use-case.spec.ts`.
- Fakes reutilizables en `<feature>/application/ports/__fakes__/`.
- Sin red, reloj ni aleatoriedad reales en unit tests (inyectar `ClockPort` si hace falta).
- Cobertura objetivo: `domain` + `application` ≥ 90 % líneas. Infra: cubrir happy path + cada traducción de error.

## Definition of Done (por task)

1. Todos los `AC-n` del task tienen test y pasan.
2. `pnpm check` en verde.
3. Sin `TODO` nuevos sin task asociado.
