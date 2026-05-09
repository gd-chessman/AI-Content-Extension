import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateStepDto, UpdateStepDto } from './steps.dto';
import { StepsService } from './steps.service';

@Controller('steps')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StepsController {
  constructor(private readonly stepsService: StepsService) {}

  @Get()
  list(@Query('workflowId') workflowId?: string) {
    return this.stepsService.list(workflowId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.stepsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateStepDto) {
    return this.stepsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStepDto) {
    return this.stepsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.stepsService.remove(id);
  }
}
