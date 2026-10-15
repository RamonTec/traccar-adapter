import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { OutboxConfig } from '../config/app-config.js';

export interface OutboxEntry {
  readonly seq: number;
  readonly subject: string;
  readonly msgId: string;
  readonly correlationId: string | undefined;
  /** JSON already serialized, published as is. */
  readonly body: string;
  /** epoch ms */
  readonly createdAt: number;
}

export type NewOutboxEntry = Omit<OutboxEntry, 'seq' | 'createdAt'>;

export class OutboxFullError extends Error {
  constructor(maxBytes: number) {
    super(`Outbox is full (${maxBytes} bytes)`);
    this.name = 'OutboxFullError';
  }
}

interface Row {
  seq: number;
  subject: string;
  msg_id: string;
  correlation_id: string | null;
  body: string;
  created_at: number;
}

/**
 * Durable FIFO of messages that could not be published to JetStream (ADR-0007).
 * Only pending messages live here: each row is deleted once JetStream acks it.
 */
export class SqliteOutboxStore {
  private readonly db: DatabaseSync;
  private bytes: number;

  constructor(
    private readonly cfg: OutboxConfig,
    private readonly clock: () => number = Date.now,
  ) {
    if (cfg.path !== ':memory:') {
      mkdirSync(dirname(cfg.path), { recursive: true });
    }
    this.db = new DatabaseSync(cfg.path);
    // WAL + FULL: an acknowledged append survives a crash or power loss.
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.db.exec(`CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      subject TEXT NOT NULL,
      msg_id TEXT NOT NULL,
      correlation_id TEXT,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    const { total } = this.db
      .prepare(
        'SELECT COALESCE(SUM(length(CAST(body AS BLOB))), 0) AS total FROM outbox',
      )
      .get() as { total: number };
    this.bytes = total;
  }

  append(entry: NewOutboxEntry): void {
    const size = Buffer.byteLength(entry.body, 'utf8');
    if (this.bytes + size > this.cfg.maxBytes) {
      throw new OutboxFullError(this.cfg.maxBytes);
    }
    this.db
      .prepare(
        'INSERT INTO outbox (subject, msg_id, correlation_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(
        entry.subject,
        entry.msgId,
        entry.correlationId ?? null,
        entry.body,
        this.clock(),
      );
    this.bytes += size;
  }

  oldest(): OutboxEntry | undefined {
    const row = this.db
      .prepare('SELECT * FROM outbox ORDER BY seq LIMIT 1')
      .get() as Row | undefined;
    return row && toEntry(row);
  }

  delete(seq: number): void {
    const row = this.db
      .prepare(
        'SELECT length(CAST(body AS BLOB)) AS size FROM outbox WHERE seq = ?',
      )
      .get(seq) as { size: number } | undefined;
    if (!row) return;
    this.db.prepare('DELETE FROM outbox WHERE seq = ?').run(seq);
    this.bytes -= row.size;
  }

  stats(): { pending: number; oldestAgeMs: number | null } {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) AS pending, MIN(created_at) AS oldest FROM outbox',
      )
      .get() as { pending: number; oldest: number | null };
    return {
      pending: row.pending,
      oldestAgeMs: row.oldest === null ? null : this.clock() - row.oldest,
    };
  }

  isWritable(): boolean {
    if (this.bytes >= this.cfg.maxBytes) return false;
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}

function toEntry(row: Row): OutboxEntry {
  return {
    seq: row.seq,
    subject: row.subject,
    msgId: row.msg_id,
    correlationId: row.correlation_id ?? undefined,
    body: row.body,
    createdAt: row.created_at,
  };
}
