import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStoryDto } from './stories.dto';
import { Story, StoryDocument } from './story.schema';
import { StoryTopic, StoryTopicDocument } from './story-topic.schema';

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name)
    private readonly storyModel: Model<StoryDocument>,
    @InjectModel(StoryTopic.name)
    private readonly storyTopicModel: Model<StoryTopicDocument>,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.storyModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return rows.map((row) => this.serializeStory(row));
  }

  async createForUser(userId: string, dto: CreateStoryDto) {
    const sourceContent = (dto.sourceContent || '').trim();
    const sourceReelUrl = this.normalizeHttpUrl((dto.sourceReelUrl || '').trim());

    if (!sourceContent) {
      throw new BadRequestException('Source content is required.');
    }
    if (!sourceReelUrl) {
      throw new BadRequestException('Invalid reel URL.');
    }
    this.assertFacebookReelUrl(sourceReelUrl);

    const canonicalReelUrl = this.canonicalSourceReelUrl(sourceReelUrl);
    const userOid = new Types.ObjectId(userId);
    /** Dedup scope: same reel URL may exist for other users; only blocked per userId. */
    const duplicate = await this.storyModel
      .findOne({ userId: userOid, sourceReelUrl: canonicalReelUrl })
      .select('_id')
      .lean();
    if (duplicate) {
      throw new ConflictException(
        'You already saved a story with this reel URL.',
      );
    }

    let topicId: Types.ObjectId | undefined;
    if (dto.topicId?.trim()) {
      const raw = dto.topicId.trim();
      if (!Types.ObjectId.isValid(raw)) {
        throw new BadRequestException('Invalid topicId.');
      }
      const topic = await this.storyTopicModel.findById(raw).lean();
      if (!topic) {
        throw new NotFoundException('Topic not found.');
      }
      const topicUser = topic.userId ? String(topic.userId) : '';
      if (topicUser && topicUser !== userId) {
        throw new ForbiddenException("You cannot use another user's topic.");
      }
      topicId = new Types.ObjectId(raw);
    }

    const name = (dto.name || '').trim().slice(0, 200);

    const created = await this.storyModel.create({
      userId: userOid,
      topicId,
      name,
      sourceContent,
      sourceReelUrl: canonicalReelUrl,
    });

    return this.serializeStory(created.toObject() as unknown as Record<string, unknown>);
  }

  /** Same canonical URL rules as create; scope per user. */
  async checkSourceReelSaved(
    userId: string,
    rawUrl: string,
  ): Promise<{ saved: boolean; storyId?: string; canonicalUrl?: string }> {
    const normalized = this.normalizeHttpUrl((rawUrl || '').trim());
    if (!normalized) {
      return { saved: false };
    }
    try {
      this.assertFacebookReelUrl(normalized);
    } catch {
      return { saved: false };
    }
    const canonical = this.canonicalSourceReelUrl(normalized);
    const doc = await this.storyModel
      .findOne({
        userId: new Types.ObjectId(userId),
        sourceReelUrl: canonical,
      })
      .select('_id')
      .lean();
    return {
      saved: Boolean(doc),
      storyId: doc ? String(doc._id) : undefined,
      canonicalUrl: canonical,
    };
  }

  private serializeStory(row: Record<string, unknown>) {
    const id = String(row._id || '');
    const userId = row.userId ? String(row.userId) : '';
    const topicId = row.topicId ? String(row.topicId) : '';
    return {
      _id: id,
      id,
      userId,
      topicId,
      name: (row.name as string) || '',
      shortContent: (row.shortContent as string) || '',
      longContent: (row.longContent as string) || '',
      sourceContent: (row.sourceContent as string) || '',
      sourceReelUrl: (row.sourceReelUrl as string) || '',
      blogPostUrl: (row.blogPostUrl as string) || '',
      fbReelUrl: (row.fbReelUrl as string) || '',
      imageStorageAddresses: Array.isArray(row.imageStorageAddresses)
        ? row.imageStorageAddresses
        : [],
      imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
      videoPrompts: Array.isArray(row.videoPrompts) ? row.videoPrompts : [],
      videoStorageAddresses: Array.isArray(row.videoStorageAddresses)
        ? row.videoStorageAddresses
        : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Chuẩn hóa URL reel để so sánh trùng và lưu một dạng thống nhất. */
  private canonicalSourceReelUrl(url: string): string {
    try {
      const u = new URL(url);
      u.protocol = 'https:';
      u.hostname = u.hostname.replace(/^www\./i, '').toLowerCase();
      const path = u.pathname.replace(/\/+$/, '');
      u.pathname = path || '/';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return url.trim();
    }
  }

  private normalizeHttpUrl(raw: string) {
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return parsed.toString();
    } catch {
      return '';
    }
  }

  private assertFacebookReelUrl(url: string) {
    let host = '';
    try {
      host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      throw new BadRequestException('Invalid reel URL.');
    }

    const okHost =
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.watch' ||
      host.endsWith('.fb.watch') ||
      host === 'm.facebook.com';

    if (!okHost) {
      throw new BadRequestException('Reel URL must be on Facebook (facebook.com or fb.watch).');
    }

    const path = url.toLowerCase();
    const looksLikeReel =
      path.includes('/reel/') || path.includes('reel_id=') || host === 'fb.watch';

    if (!looksLikeReel) {
      throw new BadRequestException('URL does not look like a Facebook reel.');
    }
  }
}
