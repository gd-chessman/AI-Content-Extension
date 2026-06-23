import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fanpage, FanpageDocument } from '../fanpages/fanpages.schema';
import { ListScrapedReelsQueryDto } from './scraped-reels.dto';
import { ScrapedReel, ScrapedReelDocument } from './scraped-reels.schema';

@Injectable()
export class ScrapedReelsService {
  constructor(
    @InjectModel(ScrapedReel.name)
    private readonly scrapedReelModel: Model<ScrapedReelDocument>,
    @InjectModel(Fanpage.name)
    private readonly fanpageModel: Model<FanpageDocument>,
  ) {}

  async listForScan(userId: string, query: ListScrapedReelsQueryDto) {
    const fanpageUrl = this.normalizeFanpageUrl((query.fanpageUrl || '').trim());
    if (!fanpageUrl) {
      throw new BadRequestException('fanpageUrl is required.');
    }

    await this.assertUserOwnsFanpageUrl(userId, fanpageUrl);

    const minViews = Math.max(0, Number(query.minViews) || 0);
    const maxViewsRaw = query.maxViews;
    const maxViews =
      maxViewsRaw != null && Number.isFinite(Number(maxViewsRaw)) && Number(maxViewsRaw) > 0
        ? Number(maxViewsRaw)
        : null;

    const limitRaw = query.limit;
    const unlimited = limitRaw == null || Number(limitRaw) <= 0;
    const limit = unlimited ? 0 : Math.min(5000, Math.max(1, Number(limitRaw)));

    const excludeSet = new Set<string>();
    for (const part of (query.excludeUrls || '').split(',')) {
      const canonical = this.canonicalReelUrl(part.trim());
      if (canonical) excludeSet.add(canonical);
    }

    const userObjectId = new Types.ObjectId(userId);
    const fanpageVariants = this.fanpageUrlVariants(fanpageUrl);

    const rows = await this.scrapedReelModel
      .find({
        fanpageUrl: { $in: fanpageVariants },
        $or: [{ userId: { $exists: false } }, { userId: null }, { userId: userObjectId }],
      })
      .sort({ sortOrder: 1, viewCount: -1, createdAt: -1 })
      .lean();

    const filtered = rows.filter((row) => {
      const views = Number(row.viewCount) || 0;
      if (views < minViews) return false;
      if (maxViews != null && views > maxViews) return false;
      const canonical = this.canonicalReelUrl(String(row.reelUrl || ''));
      if (canonical && excludeSet.has(canonical)) return false;
      return Boolean(canonical);
    });

    const sliced = unlimited ? filtered : filtered.slice(0, limit);

    return {
      fanpageUrl,
      minViews,
      maxViews,
      limit: unlimited ? null : limit,
      totalMatched: filtered.length,
      items: sliced.map((row) => ({
        id: String(row.externalVideoId || row._id),
        reelUrl: this.canonicalReelUrl(String(row.reelUrl || '')),
        title: (row.title || '').trim(),
        description: (row.description || row.title || '').trim(),
        viewsLabel: (row.viewsLabel || '').trim() || this.formatViewsLabel(Number(row.viewCount) || 0),
        viewCount: Number(row.viewCount) || 0,
        imageUrl: (row.imageUrl || '').trim(),
      })),
    };
  }

  private async assertUserOwnsFanpageUrl(userId: string, fanpageUrl: string) {
    const variants = this.fanpageUrlVariants(fanpageUrl);
    const owned = await this.fanpageModel
      .findOne({
        userId: new Types.ObjectId(userId),
        url: { $in: variants },
      })
      .lean();
    if (!owned) {
      throw new NotFoundException(
        'Fanpage not found in your list. Add the fanpage before loading pre-scraped reels.',
      );
    }
  }

  private fanpageUrlVariants(url: string): string[] {
    const normalized = this.normalizeFanpageUrl(url);
    const set = new Set<string>();
    if (normalized) set.add(normalized);
    if (url) set.add(url);
    try {
      const parsed = new URL(normalized || url);
      const withoutSlash = parsed.toString().replace(/\/$/, '');
      const withSlash = withoutSlash.endsWith('/') ? withoutSlash : `${withoutSlash}/`;
      set.add(withoutSlash);
      set.add(withSlash);
    } catch {
      /* ignore */
    }
    return [...set].filter(Boolean);
  }

  private normalizeFanpageUrl(rawUrl: string) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      if (!host.includes('facebook.com')) {
        return rawUrl;
      }

      const path = parsed.pathname.replace(/\/+$/, '');
      const isProfilePath = path.toLowerCase() === '/profile.php';
      const hasReelsPath = /\/reels$/i.test(path) || /\/reels\//i.test(`${path}/`);

      if (isProfilePath) {
        if (!parsed.searchParams.get('sk')) {
          parsed.searchParams.set('sk', 'reels_tab');
        }
        return parsed.toString();
      }

      if (!hasReelsPath) {
        parsed.pathname = `${path}/reels/`;
      } else if (!parsed.pathname.endsWith('/')) {
        parsed.pathname = `${parsed.pathname}/`;
      }

      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  private canonicalReelUrl(url: string): string {
    const value = (url || '').trim();
    if (!value) return '';
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (host === 'fb.watch' || host === 'www.fb.watch') {
        return parsed.toString();
      }
      const reelMatch = parsed.pathname.match(/\/reel\/(\d+)/i);
      if (reelMatch?.[1]) {
        return `https://www.facebook.com/reel/${reelMatch[1]}`;
      }
      const reelId = parsed.searchParams.get('reel_id') || parsed.searchParams.get('v');
      if (reelId && /^\d+$/.test(reelId)) {
        return `https://www.facebook.com/reel/${reelId}`;
      }
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString();
    } catch {
      return value;
    }
  }

  private formatViewsLabel(viewCount: number) {
    if (!Number.isFinite(viewCount) || viewCount <= 0) return '';
    if (viewCount >= 1_000_000) {
      const m = viewCount / 1_000_000;
      return m >= 10 ? `${Math.round(m)}M` : `${m.toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (viewCount >= 1_000) {
      const k = viewCount / 1_000;
      return k >= 10 ? `${Math.round(k)}K` : `${k.toFixed(1).replace(/\.0$/, '')}K`;
    }
    return String(Math.round(viewCount));
  }
}
