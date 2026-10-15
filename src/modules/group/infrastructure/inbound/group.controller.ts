import { Body, Controller, Logger, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { CreateGroupUseCase } from '../../application/use-cases/create-group.use-case.js';
import { GroupNameAmbiguousError } from '../../domain/errors.js';
import {
  type CreateGroupDto,
  createGroupSchema,
} from './dto/create-group.dto.js';

type AuditResult = 'created' | 'existing' | 'ambiguous' | 'failed';

// Only POST /groups: no operation here may move or alter existing groups.
@Controller('groups')
export class GroupController {
  private readonly logger = new Logger(GroupController.name);

  constructor(private readonly createGroup: CreateGroupUseCase) {}

  @Post()
  @RequireRole('groups:write')
  async create(
    @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ groupId: number; name: string }> {
    const startedAt = performance.now();
    let result: AuditResult = 'failed';
    let groupId: number | undefined;

    try {
      const { group, created } = await this.createGroup.execute({
        name: dto.name,
      });
      result = created ? 'created' : 'existing';
      groupId = group.id;
      res.status(created ? 201 : 200);
      return { groupId: group.id, name: group.name };
    } catch (err) {
      if (err instanceof GroupNameAmbiguousError) result = 'ambiguous';
      throw err;
    } finally {
      const audit = {
        msg: 'group.create',
        op: 'group.create',
        actor,
        name: dto.name,
        ...(groupId !== undefined && { groupId }),
        result,
        durationMs: Math.round(performance.now() - startedAt),
      };
      if (result === 'created' || result === 'existing') {
        this.logger.log(audit);
      } else {
        this.logger.warn(audit);
      }
    }
  }
}
