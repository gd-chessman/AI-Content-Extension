import { Controller, Delete, Get, Patch, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import {
  ClaimMultiWorkflowJobDto,
  CompleteMultiWorkflowJobDto,
  CreateMultiWorkflowDto,
  CreateMultiWorkflowRunDto,
  FailMultiWorkflowJobDto,
  ListMultiWorkflowJobsQueryDto,
  ListMultiWorkflowRunsQueryDto,
  UpdateMultiWorkflowDto,
} from './multi-workflows.dto';
import { MultiWorkflowsService } from './multi-workflows.service';

@Controller('multi-workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MultiWorkflowsController {
  constructor(private readonly multiWorkflowsService: MultiWorkflowsService) {}

  @Get('default')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  getDefault(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.getDefaultForUser(user.sub);
  }

  @Put('default')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  updateDefault(@Req() req: Request, @Body() dto: UpdateMultiWorkflowDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.updateDefaultForUser(user.sub, dto);
  }

  @Post('runs')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  createRun(@Req() req: Request, @Body() dto: CreateMultiWorkflowRunDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.createRunForUser(user.sub, dto);
  }

  @Get('runs')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  listRuns(@Req() req: Request, @Query() query: ListMultiWorkflowRunsQueryDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.listRunsForUser(user.sub, query);
  }

  @Get('runs/:id')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  getRun(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.getRunForUser(user.sub, id);
  }

  @Patch('runs/:id/cancel')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  cancelRun(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.cancelRunForUser(user.sub, id);
  }

  @Get('jobs')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  listJobs(@Req() req: Request, @Query() query: ListMultiWorkflowJobsQueryDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.listJobsForUser(user.sub, query);
  }

  @Get('jobs/:id')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  getJob(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.getJobForUser(user.sub, id);
  }

  @Post('jobs/claim')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  claimJob(@Req() req: Request, @Body() dto: ClaimMultiWorkflowJobDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.claimJobForUser(user.sub, dto);
  }

  @Patch('jobs/:id/complete')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  completeJob(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: CompleteMultiWorkflowJobDto,
  ) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.completeJobForUser(user.sub, id, dto);
  }

  @Patch('jobs/:id/fail')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  failJob(@Req() req: Request, @Param('id') id: string, @Body() dto: FailMultiWorkflowJobDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.failJobForUser(user.sub, id, dto);
  }

  @Get()
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  list(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.listForUser(user.sub);
  }

  @Post()
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  create(@Req() req: Request, @Body() dto: CreateMultiWorkflowDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.createForUser(user.sub, dto);
  }

  @Get(':id')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  getById(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.getByIdForUser(user.sub, id);
  }

  @Put(':id')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  updateById(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateMultiWorkflowDto) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.updateByIdForUser(user.sub, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  delete(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.deleteForUser(user.sub, id);
  }

  @Patch(':id/default')
  @Roles(UserRole.USER_VIP, UserRole.ADMIN)
  setDefault(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.multiWorkflowsService.setDefaultForUser(user.sub, id);
  }
}
