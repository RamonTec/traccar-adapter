---
id: 013-T02
status: todo           # todo | doing | blocked | done
depends_on: [013-T01]
covers: [AC-2, AC-4, AC-8, AC-10, AC-11]
---

# 013-T02 — Add SqliteOutboxStore

## Objetivo
Una cola FIFO duradera en SQLite que guarda, lee en orden, borra, mide y rechaza al superar el límite.

## Contexto (leer SOLO esto)
- `src/shared/infrastructure/config/app-config.ts` (solo `OutboxConfig`)
- skill `automated-testing` (`recipes.md` §1)

## Contrato
```ts
// src/shared/infrastructure/outbox/sqlite-outbox.store.ts
export interface OutboxEntry {
  readonly seq: number; readonly subject: string; readonly msgId: string;
  readonly correlationId: string | undefined; readonly body: string;   // JSON ya serializado
  readonly createdAt: number;   // epoch ms
}
export type NewOutboxEntry = Omit<OutboxEntry, 'seq' | 'createdAt'>;
export class OutboxFullError extends Error {}
export class SqliteOutboxStore {
  constructor(cfg: OutboxConfig, clock?: () => number);   // default Date.now
  append(entry: NewOutboxEntry): void;
  oldest(): OutboxEntry | undefined;
  delete(seq: number): void;
  stats(): { pending: number; oldestAgeMs: number | null };
  isWritable(): boolean;
  close(): void;
}
```
- `import { DatabaseSync } from 'node:sqlite'`. Si `path !== ':memory:'`, `mkdirSync(dirname(path), { recursive: true })`.
- `PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;` · tabla `outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL, msg_id TEXT NOT NULL, correlation_id TEXT, body TEXT NOT NULL, created_at INTEGER NOT NULL)`.
- Contador de bytes en memoria = `SUM(length(CAST(body AS BLOB)))` al abrir; `append` suma `Buffer.byteLength(body)` y lanza `OutboxFullError` si superaría `maxBytes` (sin escribir); `delete` resta.
- `oldestAgeMs = clock() - created_at` del más viejo, o `null` sin pendientes. `isWritable()` = `bytes < maxBytes` y un `SELECT 1` que no falle.

## Archivos a crear/modificar
- [ ] `src/shared/infrastructure/outbox/sqlite-outbox.store.ts` (nuevo) + `.spec.ts` (archivos en un directorio temporal `mkdtempSync`)

## Criterios de aceptación
- [ ] FIFO: `append` A, B, C → `oldest()` A; `delete(A)` → B.
- [ ] **AC-8** — Cerrar y reabrir con la misma ruta conserva los pendientes, su orden y el contador de bytes.
- [ ] **AC-2** — Un body con caracteres no ASCII sale idéntico.
- [ ] **AC-4/AC-10** — Con `maxBytes` pequeño, el `append` que lo superaría lanza `OutboxFullError` y no deja fila; `isWritable()` es `false` al llegar al límite.
- [ ] **AC-11** — `stats()` da `pending` y `oldestAgeMs` según un clock controlado; vacío → `{ pending: 0, oldestAgeMs: null }`.
- [ ] Crea el directorio padre si no existe.

## Fuera de alcance
- Publicar (T04) y drenar (T05).

## Verificación
```bash
pnpm vitest run src/shared/infrastructure/outbox
pnpm check
```

## Handoff
