import { UpstreamUnavailableError } from '../../../../shared/domain/upstream-unavailable.error.js';
import { GroupNameAmbiguousError } from '../../domain/errors.js';
import type { Group } from '../../domain/group.js';
import type { TraccarGroupPort } from '../ports/traccar-group.port.js';
import { CreateGroupUseCase } from './create-group.use-case.js';

class FakeTraccarGroupPort implements TraccarGroupPort {
  readonly groups: Group[] = [];
  readonly created: string[] = [];
  nextId = 100;
  failWith?: Error;

  async list(): Promise<Group[]> {
    if (this.failWith) throw this.failWith;
    return [...this.groups];
  }

  async create(name: string): Promise<Group> {
    if (this.failWith) throw this.failWith;
    this.created.push(name);
    const group: Group = { id: this.nextId++, name };
    this.groups.push(group);
    return group;
  }
}

describe('CreateGroupUseCase', () => {
  let port: FakeTraccarGroupPort;
  let useCase: CreateGroupUseCase;

  beforeEach(() => {
    port = new FakeTraccarGroupPort();
    useCase = new CreateGroupUseCase(port);
  });

  it('AC-1: creates the group when none matches, keeping the name as is', async () => {
    await expect(useCase.execute({ name: ' acme ' })).resolves.toEqual({
      group: { id: 100, name: ' acme ' },
      created: true,
    });
    expect(port.created).toEqual([' acme ']);
  });

  it('AC-2: returns the existing group without creating when exactly one matches', async () => {
    port.groups.push({ id: 7, name: 'acme' });

    await expect(useCase.execute({ name: 'acme' })).resolves.toEqual({
      group: { id: 7, name: 'acme' },
      created: false,
    });
    expect(port.created).toEqual([]);
  });

  it('AC-2: matches names case-sensitively', async () => {
    port.groups.push({ id: 7, name: 'ACME' });

    const result = await useCase.execute({ name: 'acme' });

    expect(result.created).toBe(true);
    expect(port.created).toEqual(['acme']);
  });

  it('AC-3: throws GroupNameAmbiguousError when several groups match', async () => {
    port.groups.push({ id: 7, name: 'acme' }, { id: 8, name: 'acme' });

    const error: unknown = await useCase
      .execute({ name: 'acme' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GroupNameAmbiguousError);
    expect((error as GroupNameAmbiguousError).matches).toBe(2);
    expect(port.created).toEqual([]);
  });

  it('AC-5: propagates upstream errors unwrapped and recovers on retry', async () => {
    const upstreamError = new UpstreamUnavailableError('traccar');
    port.failWith = upstreamError;

    await expect(useCase.execute({ name: 'acme' })).rejects.toBe(upstreamError);

    port.failWith = undefined;
    port.groups.push({ id: 7, name: 'acme' });

    await expect(useCase.execute({ name: 'acme' })).resolves.toEqual({
      group: { id: 7, name: 'acme' },
      created: false,
    });
  });
});
