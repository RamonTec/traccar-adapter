import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from '../../domain/domain-error.js';
import { codeForHttpStatus, httpStatusForCode } from './error-http-status.js';

export interface ErrorBody {
  code: string;
  message: string;
  correlationId: string;
  details?: unknown[];
}

const DEFAULT_MESSAGES_BY_CODE: Readonly<Record<string, string>> =
  Object.freeze({
    VALIDATION_ERROR: 'Validation failed',
    UNAUTHORIZED: 'Unauthorized',
    FORBIDDEN: 'Forbidden',
    NOT_FOUND: 'Resource not found',
    CONFLICT: 'Conflict',
    BAD_REQUEST: 'Bad request',
    UPSTREAM_UNAVAILABLE: 'Upstream service unavailable',
    INTERNAL_ERROR: 'Internal server error',
  });

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string | number }>();

    const correlationId =
      typeof request.id === 'string'
        ? request.id
        : request.id !== undefined
          ? String(request.id)
          : '';

    let status: number;
    let code: string;
    let message: string;
    let details: unknown[] | undefined;

    if (exception instanceof DomainError) {
      const mappedStatus = httpStatusForCode(exception.code);
      if (mappedStatus !== undefined) {
        status = mappedStatus;
        code = exception.code;
        message = exception.message;
        details = detailsOf(exception);
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        code = 'INTERNAL_ERROR';
        message = DEFAULT_MESSAGES_BY_CODE.INTERNAL_ERROR;
        this.logger.error(
          {
            err: exception,
            code: exception.code,
            msg: 'Unmapped domain error code',
          },
          'Unmapped domain error code',
        );
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = codeForHttpStatus(status);
      message = DEFAULT_MESSAGES_BY_CODE[code] ?? 'Internal server error';
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';
      message = DEFAULT_MESSAGES_BY_CODE.INTERNAL_ERROR;
      this.logger.error(
        {
          err: exception,
          msg: 'Unhandled exception',
        },
        'Unhandled exception',
      );
    }

    const body: ErrorBody = {
      code,
      message,
      correlationId,
      ...(details !== undefined && { details }),
    };

    response.status(status).json(body);
  }
}

function detailsOf(error: DomainError): unknown[] | undefined {
  const details: unknown = (error as { details?: unknown }).details;
  return Array.isArray(details) ? details : undefined;
}
