---
id: 014-T03
status: todo
depends_on: [014-T02]
covers: [AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7]
---

# 014-T03 — Suite de imagen: build, arranque, config, usuario, contenido, healthcheck

## Objetivo
`pnpm test:image` construye la imagen y verifica automáticamente AC-1..AC-7.

## Contexto (leer SOLO esto)
- `docs/specs/014-container-image/design.md` (tabla de verificación y helpers)
- `vitest.config.e2e.ts`
- `test/app.e2e-spec.ts` (sección "Real process", como referencia de arranque y AC-3)
- `docs/standards/testing.md`

## Contrato
```ts
// test/image/docker.ts
export const IMAGE = 'traccar-adapter:test';
export function docker(args: string[], opts?: { timeoutMs?: number }): Promise<{ code: number; stdout: string; stderr: string }>;
export function runContainer(name: string, opts: { env: Record<string, string>; volume?: string; network?: string; publish?: boolean }): Promise<{ port: number }>;
export function waitHealthy(name: string, timeoutMs: number): Promise<void>;
export function removeAll(names: string[]): Promise<void>;
```
`package.json`: `"test:image": "vitest run --config ./vitest.config.image.ts"`.

## Archivos a crear/modificar
- [ ] `vitest.config.image.ts` (nuevo) + `package.json` (mod)
- [ ] `test/image/docker.ts` (nuevo)
- [ ] `test/image/container.image-spec.ts` (nuevo)

## Criterios de aceptación
- [ ] Un `it('AC-n: …')` por cada AC-1..AC-7 según la tabla del design.
- [ ] `pnpm test` y `pnpm test:e2e` no recogen `*.image-spec.ts`.

## Fuera de alcance
- AC-8 y AC-9 (T04).

## Verificación
```bash
pnpm test:image
pnpm check
```

## Handoff
