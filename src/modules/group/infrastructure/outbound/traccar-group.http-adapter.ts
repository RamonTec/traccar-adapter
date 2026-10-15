import type { TraccarHttpClient } from '../../../../shared/infrastructure/traccar/traccar-http-client.js';
import type { TraccarGroupPort } from '../../application/ports/traccar-group.port.js';
import type { Group } from '../../domain/group.js';

interface TraccarGroupDto {
  id: number;
  name: string;
  groupId?: number;
  attributes?: object;
}

function toGroup(dto: TraccarGroupDto): Group {
  return { id: dto.id, name: dto.name };
}

export class TraccarGroupHttpAdapter implements TraccarGroupPort {
  constructor(private readonly client: TraccarHttpClient) {}

  async list(): Promise<Group[]> {
    const dtos = await this.client.request<TraccarGroupDto[]>(
      'group.list',
      'GET',
      '/api/groups',
    );
    return dtos.map(toGroup);
  }

  async create(name: string): Promise<Group> {
    // Only { name }: without groupId Traccar creates the group with no parent.
    const dto = await this.client.request<TraccarGroupDto>(
      'group.create',
      'POST',
      '/api/groups',
      { body: { name } },
    );
    return toGroup(dto);
  }
}
