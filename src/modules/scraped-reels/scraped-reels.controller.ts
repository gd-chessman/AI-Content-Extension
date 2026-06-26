import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { JwtPayload } from '../auth/jwt.strategy';
import { UserRole } from '../users/users.schema';
import { ListScrapedReelsQueryDto, UpsertScrapedReelsDto } from './scraped-reels.dto';
import { ScrapedReelsService } from './scraped-reels.service';

@Controller('scraped-reels')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.USER, UserRole.USER_VIP, UserRole.ADMIN)
export class ScrapedReelsController {
  constructor(private readonly scrapedReelsService: ScrapedReelsService) {}

  @Get()
  list(@Req() req: Request, @Query() query: ListScrapedReelsQueryDto) {
    const user = req.user as JwtPayload;
    return this.scrapedReelsService.listForScan(user.sub, query);
  }

  /** Thêm/cập nhật reel đã quét local — không xóa reel cũ không có trong payload. */
  @Post('upsert')
  upsert(@Req() req: Request, @Body() body: UpsertScrapedReelsDto) {
    const user = req.user as JwtPayload;
    return this.scrapedReelsService.upsertFromLocalScan(user.sub, body);
  }
}
