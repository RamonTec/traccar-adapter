import { DomainError } from './domain-error.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(readonly details: ValidationIssue[]) {
    super('Validation failed');
  }
}
