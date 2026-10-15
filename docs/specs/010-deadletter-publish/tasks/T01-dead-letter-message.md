---
id: 010-T01
status: done           # todo | doing | blocked | done
depends_on: [008-T02]
covers: [AC-2, AC-3, AC-4]
---

# 010-T01 — Add buildDeadLetterMessage

## Objetivo
Construir el mensaje de dead-letter de ADR-0004: id deduplicable, body original reproducible byte a byte y detalle sin secretos.

## Contexto (leer SOLO esto)
- `src/modules/ingestion/application/ports/dead-letter-publisher.port.ts`
- skill `automated-testing` (`recipes.md` §1)

## Contrato
```ts
// src/modules/ingestion/infrastructure/outbound/dead-letter-message.ts
import { createHash } from 'node:crypto';
export const DEAD_LETTER_MAX_RAW_BYTES = 65_536;
export const DEAD_LETTER_MAX_DETAIL_CHARS = 500;
export interface DeadLetterMessage {
  readonly id: string; readonly source: 'traccar'; readonly kind: PayloadKind; readonly reason: DeadLetterReason;
  readonly detail: string; readonly receivedAt: string; readonly correlationId: string;
  readonly rawPayload: string; readonly rawEncoding: 'utf8' | 'base64'; readonly truncated: boolean;
}
export function buildDeadLetterMessage(req: DeadLetterRequest): DeadLetterMessage;
// id = 'traccar-deadletter-' + sha256 hex de TODO req.rawBody
// head = rawBody.subarray(0, 65536); truncated = rawBody.length > 65536
// try new TextDecoder('utf-8', { fatal: true }).decode(head) → utf8 · catch → Buffer.from(head).toString('base64')
// detail = req.detail.replace(/bearer\s+\S+/gi, 'Bearer [REDACTED]').slice(0, 500)
```

## Archivos a crear/modificar
- [ ] `src/modules/ingestion/infrastructure/outbound/dead-letter-message.ts` (nuevo)
- [ ] `src/modules/ingestion/infrastructure/outbound/dead-letter-message.spec.ts` (nuevo)

## Criterios de aceptación
- [ ] **AC-2** — Mismo body → mismo `id`; un body que cambia en 1 byte → otro `id`; el formato es `traccar-deadletter-` + 64 caracteres hexadecimales.
- [ ] **AC-3a** — Body `{"a":` → `rawEncoding: 'utf8'`, `rawPayload === '{"a":'`, `truncated: false`.
- [ ] **AC-3b** — Bytes `[0xff, 0x00, 0xfe]` → `base64`, y `Buffer.from(rawPayload, 'base64')` es igual a los bytes originales.
- [ ] **AC-3c** — Un body de 100 000 bytes → `truncated: true`, el `rawPayload` decodificado mide 65 536 bytes, y el `id` usa el hash de los 100 000.
- [ ] **AC-4** — Un detail con `Bearer abc.def.ghi` → contiene `Bearer [REDACTED]` y no `abc.def.ghi`; un detail de 2000 caracteres → 500.
- [ ] `source: 'traccar'` y `receivedAt` en ISO (termina en `Z`).

## Fuera de alcance
- Publicar (T02).

## Verificación
```bash
pnpm vitest run src/modules/ingestion/infrastructure/outbound
pnpm check
```

## Handoff
- `buildDeadLetterMessage(req)`: id = sha256 del body completo; `rawPayload` = primeros 64 KiB en utf8 o base64 (si no son UTF-8 válido); `truncated`; detail con Bearer redactado y máx. 500.
- Nota: si el corte de 64 KiB parte un carácter multibyte, el decode estricto falla y se guarda en base64 (correcto byte a byte).
