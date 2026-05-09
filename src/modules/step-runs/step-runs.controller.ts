import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateStepRunDto, UpdateStepRunDto } from './step-runs.dto';
import { StepRunsService } from './step-runs.service';

@Controller('step-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER_VIP, UserRole.ADMIN)
export class StepRunsController {
  constructor(private readonly stepRunsService: StepRunsService) {}

  @Get('my')
  listForUser(@Req() req: Request, @Query('workflowRunId') workflowRunId?: string) {
    const user = req.user as JwtPayload;
    return this.stepRunsService.listForUser(user.sub, workflowRunId);
  }

  @Post()
  createForUser(@Req() req: Request, @Body() dto: CreateStepRunDto) {
    const user = req.user as JwtPayload;
    return this.stepRunsService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  updateForUser(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateStepRunDto) {
    const user = req.user as JwtPayload;
    return this.stepRunsService.updateForUser(id, user.sub, dto);
  }
}
