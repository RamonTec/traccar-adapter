import type { Group } from '../../domain/group.js';

export const TRACCAR_GROUP_PORT = Symbol('TraccarGroupPort');

export interface TraccarGroupPort {
  /** All groups accessible to the service account. */
  list(): Promise<Group[]>;
  /** Creates a group without a parent group. */
  create(name: string): Promise<Group>;
}
