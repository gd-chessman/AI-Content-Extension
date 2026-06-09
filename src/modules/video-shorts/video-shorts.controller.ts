import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import {
  CreateVideoShortDto,
  LatestGrokReadyVideoShortQueryDto,
  ListMyVideoShortsQueryDto,
  PatchVideoShortDto,
  SkipVideoShortSourceDto,
  UpsertVideoShortSourceDto,
} from './video-shorts.dto';
import { VideoShortsService } from './video-shorts.service';

@Controller('video-shorts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class VideoShortsController {
  constructor(private readonly storiesService: VideoShortsService) {}

  @Get('my/latest-grok-ready')
  getLatestGrokReady(@Req() req: Request, @Query() query: LatestGrokReadyVideoShortQueryDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.getLatestGrokReadyForUser(
      user.sub,
      LatestGrokReadyVideoShortQueryDto.parse(query),
    );
  }

  @Get('my/:id')
  getMyById(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.getByIdForUser(user.sub, id);
  }

  @Get('my')
  listMy(@Req() req: Request, @Query() query: ListMyVideoShortsQueryDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.listForUser(user.sub, ListMyVideoShortsQueryDto.parse(query));
  }

  @Get('sources/my')
  listMySources(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.storiesService.listSourcesForUser(user.sub);
  }

  /** Đã có VideoShortSource cho reel này chưa (chỉ story nguồn, không kiểm tra VideoShort). */
  @Get('sources/check-reel')
  checkVideoShortSourceForReel(@Req() req: Request, @Query('url') url?: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.checkVideoShortSourceForReel(user.sub, url || '');
  }

  @Post('sources/sync')
  syncVideoShortSource(@Req() req: Request, @Body() dto: UpsertVideoShortSourceDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.upsertVideoShortSourceForUser(user.sub, dto);
  }

  @Post('sources/skip')
  skipVideoShortSource(@Req() req: Request, @Body() dto: SkipVideoShortSourceDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.skipVideoShortSourceForUser(user.sub, dto);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateVideoShortDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  patchVideoShort(@Req() req: Request, @Param('id') id: string, @Body() dto: PatchVideoShortDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.patchForUser(user.sub, id, dto);
  }

  @Post(':id/increment-usage')
  incrementUsage(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.incrementUsage(user.sub, id);
  }
}
