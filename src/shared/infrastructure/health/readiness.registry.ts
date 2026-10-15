import { Injectable } from '@nestjs/common';

export type ReadinessCheck = () => Promise<boolean>;

/** 'down': a non-critical dependency is unavailable; readiness stays ok. */
export type ReadinessStatus = 'ok' | 'error' | 'down';

export type ReadinessInfo = Record<string, number | null>;

export interface ReadinessOptions {
  /** Default true. A non-critical failure reports 'down' and keeps the service ready. */
  readonly critical?: boolean;
}

export interface ReadinessResult {
  readonly ok: boolean;
  readonly checks: Record<string, ReadinessStatus>;
  readonly info: Record<string, ReadinessInfo>;
}

@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<
    string,
    { check: ReadinessCheck; critical: boolean }
  >();
  private readonly infos = new Map<string, () => ReadinessInfo>();

  register(
    name: string,
    check: ReadinessCheck,
    opts: ReadinessOptions = {},
  ): void {
    if (this.checks.has(name)) {
      throw new Error(`Readiness check "${name}" is already registered`);
    }
    this.checks.set(name, { check, critical: opts.critical ?? true });
  }

  registerInfo(name: string, info: () => ReadinessInfo): void {
    if (this.infos.has(name)) {
      throw new Error(`Readiness info "${name}" is already registered`);
    }
    this.infos.set(name, info);
  }

  async run(): Promise<ReadinessResult> {
    const entries = Array.from(this.checks.entries());
    const results = await Promise.all(
      entries.map(async ([name, { check, critical }]) => {
        const failed: ReadinessStatus = critical ? 'error' : 'down';
        try {
          const passed = await check();
          return [name, passed ? ('ok' as const) : failed] as const;
        } catch {
          return [name, failed] as const;
        }
      }),
    );

    const checks: Record<string, ReadinessStatus> = {};
    let ok = true;

    for (const [name, status] of results) {
      checks[name] = status;
      if (status === 'error') {
        ok = false;
      }
    }

    const info: Record<string, ReadinessInfo> = {};
    for (const [name, read] of this.infos) {
      try {
        info[name] = read();
      } catch {
        // Diagnostic only: a failing info provider never breaks readiness.
      }
    }

    return { ok, checks, info };
  }
}
