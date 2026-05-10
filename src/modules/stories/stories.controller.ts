import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/users.schema';
import { CreateStoryDto, PatchStoryDto, UpsertStorySourceDto } from './stories.dto';
import { StoriesService } from './stories.service';

@Controller('stories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get('my')
  listMy(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.storiesService.listForUser(user.sub);
  }

  @Get('sources/my')
  listMySources(@Req() req: Request) {
    const user = req.user as JwtPayload;
    return this.storiesService.listSourcesForUser(user.sub);
  }

  @Get('check-reel')
  checkReel(@Req() req: Request, @Query('url') url?: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.checkSourceReelSaved(user.sub, url || '');
  }

  @Post('sources/sync')
  syncStorySource(@Req() req: Request, @Body() dto: UpsertStorySourceDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.upsertStorySourceForUser(user.sub, dto);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateStoryDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.createForUser(user.sub, dto);
  }

  @Patch(':id')
  patchStory(@Req() req: Request, @Param('id') id: string, @Body() dto: PatchStoryDto) {
    const user = req.user as JwtPayload;
    return this.storiesService.patchForUser(user.sub, id, dto);
  }

  @Post(':id/increment-usage')
  incrementUsage(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as JwtPayload;
    return this.storiesService.incrementUsage(user.sub, id);
  }
}
