import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  RequireRole,
} from '../../../../shared/infrastructure/auth/auth.decorators.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { CreateGroupUseCase } from '../../application/use-cases/create-group.use-case.js';
import {
  type CreateGroupDto,
  createGroupSchema,
} from './dto/create-group.dto.js';

// Only POST /groups: no operation here may move or alter existing groups.
@Controller('groups')
export class GroupController {
  constructor(private readonly createGroup: CreateGroupUseCase) {}

  @Post()
  @RequireRole('groups:write')
  async create(
    @Body(new ZodValidationPipe(createGroupSchema)) dto: CreateGroupDto,
    @Actor() actor: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ groupId: number; name: string }> {
    // Auditing happens in the use case (ADR-0006); the controller only passes the actor.
    const { group, created } = await this.createGroup.execute({
      name: dto.name,
      actor,
    });
    res.status(created ? 201 : 200);
    return { groupId: group.id, name: group.name };
  }
}
