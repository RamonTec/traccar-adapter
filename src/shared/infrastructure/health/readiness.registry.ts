import { Injectable } from '@nestjs/common';

export type ReadinessCheck = () => Promise<boolean>;

export type ReadinessStatus = 'ok' | 'error';

export interface ReadinessResult {
  readonly ok: boolean;
  readonly checks: Record<string, ReadinessStatus>;
}

@Injectable()
export class ReadinessRegistry {
  private readonly checks = new Map<string, ReadinessCheck>();

  register(name: string, check: ReadinessCheck): void {
    if (this.checks.has(name)) {
      throw new Error(`Readiness check "${name}" is already registered`);
    }
    this.checks.set(name, check);
  }

  async run(): Promise<ReadinessResult> {
    const entries = Array.from(this.checks.entries());
    const results = await Promise.all(
      entries.map(async ([name, check]) => {
        try {
          const passed = await check();
          return [name, passed ? ('ok' as const) : ('error' as const)] as const;
        } catch {
          return [name, 'error' as const] as const;
        }
      }),
    );

    const checks: Record<string, ReadinessStatus> = {};
    let ok = true;

    for (const [name, status] of results) {
      checks[name] = status;
      if (status !== 'ok') {
        ok = false;
      }
    }

    return { ok, checks };
  }
}
