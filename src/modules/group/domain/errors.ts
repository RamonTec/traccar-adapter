import { DomainError } from '../../../shared/domain/domain-error.js';

export class GroupNameAmbiguousError extends DomainError {
  readonly code = 'GROUP_NAME_AMBIGUOUS';

  constructor(
    readonly name: string,
    readonly matches: number,
  ) {
    super(`${matches} groups named "${name}" exist in Traccar`);
  }
}
