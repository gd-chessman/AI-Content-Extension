import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateStepToolDto, SetStepToolsDto, UpdateStepToolDto } from './step-tools.dto';
import { StepToolsService } from './step-tools.service';

@Controller('step-tools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StepToolsController {
  constructor(private readonly stepToolsService: StepToolsService) {}

  @Get()
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  listByStep(@Query('stepId') stepId: string, @Query('activeOnly') activeOnly?: string) {
    if (!stepId) {
      throw new BadRequestException('stepId query is required.');
    }
    return this.stepToolsService.listByStepId(stepId, activeOnly !== 'false');
  }

  @Get('workflow/:workflowId')
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  listByWorkflow(@Param('workflowId') workflowId: string, @Query('activeOnly') activeOnly?: string) {
    return this.stepToolsService.listByWorkflowId(workflowId, activeOnly !== 'false');
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  getById(@Param('id') id: string) {
    return this.stepToolsService.getById(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateStepToolDto) {
    return this.stepToolsService.create(dto);
  }

  @Put('step/:stepId')
  @Roles(UserRole.ADMIN)
  setForStep(@Param('stepId') stepId: string, @Body() dto: SetStepToolsDto) {
    return this.stepToolsService.setForStep(stepId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateStepToolDto) {
    return this.stepToolsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.stepToolsService.remove(id);
  }
}
