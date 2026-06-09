import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { SkipVideoSourceDto, UpsertVideoSourceDto } from './video-shorts.dto';
import { VideoShortsService } from './video-shorts.service';

@Controller('video-sources')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class VideoSourcesController {
  constructor(private readonly storiesService: VideoShortsService) {}

  @Get('my')
  listMy(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.storiesService.listSourcesForUser(user.sub);
  }

  @Get('check-reel')
  checkForReel(@Req() req: Request, @Query('url') url?: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.checkVideoSourceForReel(user.sub, url || '');
  }

  @Post('sync')
  sync(@Req() req: Request, @Body() dto: UpsertVideoSourceDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.upsertVideoSourceForUser(user.sub, dto);
  }

  @Post('skip')
  skip(@Req() req: Request, @Body() dto: SkipVideoSourceDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.skipVideoSourceForUser(user.sub, dto);
  }
}
