import { DomainError } from './domain-error.js';

export class UpstreamUnavailableError extends DomainError {
  readonly code = 'UPSTREAM_UNAVAILABLE';

  constructor(readonly upstream: string) {
    super(`${upstream} is unavailable`);
  }
}
