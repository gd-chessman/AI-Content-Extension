import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateWorkflowRunDto, UpdateWorkflowRunDto } from './workflow-runs.dto';
import { WorkflowRunsService } from './workflow-runs.service';

@Controller('workflow-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.ADMIN)
export class WorkflowRunsController {
  constructor(private readonly workflowRunsService: WorkflowRunsService) {}

  @Get('my')
  listForUser(@Req() req: Request, @Query('workflowId') workflowId?: string) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.listForUser(user.sub, workflowId);
  }

  @Get('my/:id')
  getForUser(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.getForUser(id, user.sub);
  }

  @Post()
  createForUser(@Req() req: Request, @Body() dto: CreateWorkflowRunDto) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  updateForUser(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWorkflowRunDto) {
    const user = req.user as JwtPayload;
    return this.workflowRunsService.updateForUser(id, user.sub, dto);
  }
}
