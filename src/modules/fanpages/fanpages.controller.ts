import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../users/users.schema';
import { CreateFanpageDto, UpdateFanpageDto } from './fanpages.dto';
import { FanpagesService } from './fanpages.service';

@Controller('fanpages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class FanpagesController {
  constructor(private readonly fanpagesService: FanpagesService) {}

  @Get()
  list(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.fanpagesService.list(user.sub);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateFanpageDto) {
    const user = req.user as JwtPayload;
    return this.fanpagesService.create(user.sub, dto);
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateFanpageDto) {
    const user = req.user as JwtPayload;
    return this.fanpagesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.fanpagesService.remove(user.sub, id);
  }

  @Delete()
  removeAll(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.fanpagesService.removeAll(user.sub);
  }
}
