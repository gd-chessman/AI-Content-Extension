import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../users/users.schema';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('me')
  getMySettings(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.settingsService.getMySettings(user.sub);
  }

  @Patch('me')
  updateMySettings(@Req() req: Request, @Body() dto: UpdateSettingsDto) {
    const user = req.user as JwtPayload;
    return this.settingsService.updateMySettings(user.sub, dto);
  }
}
