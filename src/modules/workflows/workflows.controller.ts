import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateWorkflowDto, UpdateWorkflowDto } from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get('user')
  @Roles(UserRole.USER, UserRole.ADMIN)
  listForUser() {
    return this.workflowsService.listForUser();
  }

  @Get('user/:id')
  @Roles(UserRole.USER, UserRole.ADMIN)
  getDetailForUser(@Param('id') id: string) {
    return this.workflowsService.getDetailForUser(id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list() {
    return this.workflowsService.list();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getById(@Param('id') id: string) {
    return this.workflowsService.getById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflowsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflowsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.workflowsService.remove(id);
  }
}
