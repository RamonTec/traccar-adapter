# ADR-0001 — Hexagonal organizada por feature, con capas puras sin NestJS

- Estado: propuesto
- Fecha: 2026-10-13

## Contexto
El planning exige hexagonal. Trabajamos con micro-tasks ejecutados por un agente con contexto limitado: interesa que un task toque un solo directorio y que las reglas de capas se verifiquen solas, no por memoria del agente.

## Decisión
- Layout `src/modules/<feature>/{domain,application,infrastructure}` + `src/shared/`.
- `domain` y `application` sin `@nestjs/*`; use cases como clases planas registradas con `useFactory`.
- Ports definidos en el módulo consumidor (p.ej. `TraccarGroupPort`, `TraccarDevicePort`) en lugar de un único `TraccarClientPort`; comparten un cliente HTTP de bajo nivel en `shared/infrastructure/traccar`.
- Reglas de importación enforced con `no-restricted-imports` en `.oxlintrc.json`.

## Consecuencias
- (+) Use cases testeables sin `TestingModule`; violaciones de capa fallan en `pnpm lint`.
- (+) Ports pequeños (ISP): ningún módulo ve operaciones de Traccar que no usa — ayuda a FR3.
- (−) Algo más de boilerplate en el wiring de módulos.
