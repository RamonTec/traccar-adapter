import type { AuditLogPort } from '../../../../shared/application/ports/audit-log.port.js';
import type { ClockPort } from '../../../../shared/application/ports/clock.port.js';
import { runAudited } from '../../../../shared/application/run-audited.js';
import { GroupNameAmbiguousError } from '../../domain/errors.js';
import type { Group } from '../../domain/group.js';
import type { TraccarGroupPort } from '../ports/traccar-group.port.js';

export interface CreateGroupInput {
  name: string;
  actor: string | undefined;
}

export interface CreateGroupOutput {
  group: Group;
  created: boolean;
}

export class CreateGroupUseCase {
  constructor(
    private readonly traccar: TraccarGroupPort,
    private readonly audit: AuditLogPort,
    private readonly clock: ClockPort,
  ) {}

  execute(input: CreateGroupInput): Promise<CreateGroupOutput> {
    return runAudited(
      { audit: this.audit, clock: this.clock },
      {
        op: 'group.create',
        actor: input.actor,
        fields: { name: input.name },
        success: ({ group, created }) => ({
          result: created ? 'created' : 'existing',
          fields: { groupId: group.id },
        }),
        failure: (err) => ({
          result:
            err instanceof GroupNameAmbiguousError ? 'ambiguous' : 'failed',
        }),
      },
      () => this.run(input),
    );
  }

  private async run(input: CreateGroupInput): Promise<CreateGroupOutput> {
    // Exact, case-sensitive match on the name as received (no trim).
    const matches = (await this.traccar.list()).filter(
      (g) => g.name === input.name,
    );

    if (matches.length > 1) {
      throw new GroupNameAmbiguousError(input.name, matches.length);
    }

    const [existing] = matches;
    if (existing) {
      return { group: existing, created: false };
    }

    const group = await this.traccar.create(input.name);
    return { group, created: true };
  }
}
