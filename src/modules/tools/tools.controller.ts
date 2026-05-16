import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { WorkflowPlatform } from '../workflows/workflow.schema';
import { CreateToolDto, UpdateToolDto } from './tools.dto';
import { ToolPlacement } from './tool.schema';
import { ToolsService } from './tools.service';

@Controller('tools')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  list(
    @Query('platform') platform?: WorkflowPlatform,
    @Query('placement') placement?: ToolPlacement,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const onlyActive = activeOnly !== 'false';
    return this.toolsService.list(platform, placement, onlyActive);
  }

  @Get('code/:code')
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  getByCode(@Param('code') code: string) {
    return this.toolsService.getByCode(code);
  }

  /** Script thực thi — FE gọi mỗi lần bấm nút công cụ. */
  @Get(':id/handler')
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  getHandler(@Param('id') id: string) {
    return this.toolsService.getHandlerScript(id);
  }

  @Get(':id')
  @Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
  getById(@Param('id') id: string) {
    return this.toolsService.getById(id);
  }

  @Post('seed/chatgpt')
  @Roles(UserRole.ADMIN)
  seedChatgpt() {
    return this.toolsService.seedChatgptTools();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateToolDto) {
    return this.toolsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateToolDto) {
    return this.toolsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.toolsService.remove(id);
  }
}
