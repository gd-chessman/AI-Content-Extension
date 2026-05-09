import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../users/users.schema';
import { UpdateWebBlogDto } from './webblog.dto';
import { WebBlogService } from './webblog.service';

@Controller('webblog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class WebBlogController {
  constructor(private readonly webBlogService: WebBlogService) {}

  @Get('me')
  getMySetting(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.webBlogService.getMySetting(user.sub);
  }

  @Patch('me')
  updateMySetting(@Req() req: Request, @Body() dto: UpdateWebBlogDto) {
    const user = req.user as JwtPayload;
    return this.webBlogService.updateMySetting(user.sub, dto);
  }
}
