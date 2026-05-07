import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateFanpageDto, UpdateFanpageDto } from './fanpages.dto';
import { Fanpage, FanpageDocument } from './fanpages.schema';

@Injectable()
export class FanpagesService {
  constructor(
    @InjectModel(Fanpage.name)
    private readonly fanpageModel: Model<FanpageDocument>,
  ) {}

  async list(userId: string) {
    return this.fanpageModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async create(userId: string, dto: CreateFanpageDto) {
    const url = this.normalizeFanpageUrl((dto.url || '').trim());
    if (!url) {
      throw new BadRequestException('URL is required.');
    }
    this.assertValidFacebookUrl(url);
    const name = await this.resolveFanpageName((dto.name || '').trim(), url);

    try {
      const created = await this.fanpageModel.create({
        userId: new Types.ObjectId(userId),
        name,
        url,
      });
      return created.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Fanpage URL already exists.');
      }
      throw error;
    }
  }

  async update(userId: string, fanpageId: string, dto: UpdateFanpageDto) {
    const patch: { name?: string; url?: string } = {};
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.url !== undefined) {
      patch.url = this.normalizeFanpageUrl(dto.url.trim());
      this.assertValidFacebookUrl(patch.url);
    }
    if (dto.url !== undefined && dto.name === undefined) {
      patch.name = await this.resolveFanpageName('', patch.url);
    }
    if (!Object.keys(patch).length) {
      throw new BadRequestException('Nothing to update.');
    }

    try {
      const updated = await this.fanpageModel.findOneAndUpdate(
        { _id: fanpageId, userId: new Types.ObjectId(userId) },
        patch,
        { new: true },
      );
      if (!updated) {
        throw new NotFoundException('Fanpage not found.');
      }
      return updated.toObject();
    } catch (error: any) {
      if (error?.code === 11000) {
        throw new ConflictException('Fanpage URL already exists.');
      }
      throw error;
    }
  }

  async remove(userId: string, fanpageId: string) {
    const deleted = await this.fanpageModel.findOneAndDelete({
      _id: fanpageId,
      userId: new Types.ObjectId(userId),
    });
    if (!deleted) {
      throw new NotFoundException('Fanpage not found.');
    }
    return { message: 'Deleted successfully.' };
  }

  async removeAll(userId: string) {
    const result = await this.fanpageModel.deleteMany({
      userId: new Types.ObjectId(userId),
    });
    return { message: `Deleted ${result.deletedCount || 0} fanpages.` };
  }

  private deriveFanpageName(url: string) {
    try {
      const parsed = new URL(url);
      const pathSegments = parsed.pathname.split('/').filter(Boolean);
      const firstSegment = pathSegments[0] || '';

      if (firstSegment.toLowerCase() === 'profile.php') {
        const profileId = parsed.searchParams.get('id');
        return profileId ? `Profile ${profileId}` : 'Facebook Profile';
      }

      if (firstSegment) {
        return firstSegment;
      }

      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'Facebook Fanpage';
    }
  }

  private async resolveFanpageName(name: string, url: string) {
    if (name) return name;
    const detected =
      (await this.fetchFanpageNameFromGraph(url)) ||
      (await this.fetchFanpageNameFromUrl(url));
    return detected || this.deriveFanpageName(url);
  }

  private async fetchFanpageNameFromGraph(url: string) {
    try {
      const endpoint = `https://graph.facebook.com/?id=${encodeURIComponent(url)}&fields=name`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return '';

      const data = (await response.json()) as { name?: string };
      return (data?.name || '').trim();
    } catch {
      return '';
    }
  }

  private async fetchFanpageNameFromUrl(url: string) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return '';

      const html = await response.text();
      const ogTitleMatch =
        html.match(
          /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i,
        );
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const rawTitle = (ogTitleMatch?.[1] || titleMatch?.[1] || '').trim();
      if (!rawTitle) return '';

      const clean = this.cleanupDetectedTitle(rawTitle);
      if (
        !clean ||
        /^facebook$/i.test(clean) ||
        /^(log in|login|đăng nhập|content unavailable|trang này hiện không khả dụng)/i.test(
          clean,
        )
      ) {
        return '';
      }
      return clean;
    } catch {
      return '';
    }
  }

  private cleanupDetectedTitle(title: string) {
    const decoded = title
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    return decoded.replace(/\s*[\|\-]\s*facebook\s*$/i, '').trim();
  }

  private assertValidFacebookUrl(value: string) {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BadRequestException('URL must be http or https.');
      }

      const host = parsed.hostname.toLowerCase();
      if (!host.includes('facebook.com')) {
        throw new BadRequestException('Only Facebook URLs are supported.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid URL format.');
    }
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
}
