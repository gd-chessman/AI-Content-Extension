import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../users/users.schema';
import { PushGgSheetDto, UpdateGgSheetDto } from './ggsheet.dto';
import { GgSheetService } from './ggsheet.service';

@Controller('ggsheet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class GgSheetController {
  constructor(private readonly ggSheetService: GgSheetService) {}

  @Get('me')
  getMySetting(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ggSheetService.getMySetting(user.sub);
  }

  @Patch('me')
  updateMySetting(@Req() req: Request, @Body() dto: UpdateGgSheetDto) {
    const user = req.user as JwtPayload;
    return this.ggSheetService.updateMySetting(user.sub, dto);
  }

  @Get('stats/me')
  getMyStats(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.ggSheetService.getMyStats(user.sub);
  }

  @Post('push/preview')
  previewPush(@Req() req: Request, @Body() dto: PushGgSheetDto) {
    const user = req.user as JwtPayload;
    return this.ggSheetService.previewPush(user.sub, dto);
  }

  @Post('push')
  push(@Req() req: Request, @Body() dto: PushGgSheetDto) {
    const user = req.user as JwtPayload;
    return this.ggSheetService.push(user.sub, dto);
  }
}
