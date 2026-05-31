import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import {
  CreateWorkflowScheduleDto,
  ListWorkflowScheduleRunsQueryDto,
  ToggleWorkflowScheduleDto,
  UpdateWorkflowScheduleDto,
} from './workflow-schedules.dto';
import { WorkflowSchedulesService } from './workflow-schedules.service';

@Controller('workflow-schedules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER_VIP, UserRole.ADMIN)
export class WorkflowSchedulesController {
  constructor(private readonly workflowSchedulesService: WorkflowSchedulesService) {}

  @Get()
  list(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.listForUser(user.sub);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateWorkflowScheduleDto) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.createForUser(user.sub, dto);
  }

  @Get(':id/runs')
  listRuns(
    @Req() req: Request,
    @Param('id') id: string,
    @Query() query: ListWorkflowScheduleRunsQueryDto,
  ) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.listRunsForUser(user.sub, id, query);
  }

  @Get(':id')
  getById(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.getForUser(user.sub, id);
  }

  @Patch(':id/toggle')
  toggle(@Req() req: Request, @Param('id') id: string, @Body() dto: ToggleWorkflowScheduleDto) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.toggleForUser(user.sub, id, dto.enabled === true);
  }

  @Post(':id/run-now')
  runNow(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.runNowForUser(user.sub, id);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWorkflowScheduleDto) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.updateForUser(user.sub, id, dto);
  }

  @Delete(':id')
  delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.workflowSchedulesService.deleteForUser(user.sub, id);
  }
}
