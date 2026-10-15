import { GroupNameAmbiguousError } from '../../domain/errors.js';
import type { Group } from '../../domain/group.js';
import type { TraccarGroupPort } from '../ports/traccar-group.port.js';

export interface CreateGroupInput {
  name: string;
}

export interface CreateGroupOutput {
  group: Group;
  created: boolean;
}

export class CreateGroupUseCase {
  constructor(private readonly traccar: TraccarGroupPort) {}

  async execute(input: CreateGroupInput): Promise<CreateGroupOutput> {
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
