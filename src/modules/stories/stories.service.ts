import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateStoryDto, ListMyStoriesQuery, PatchStoryDto, UpsertStorySourceDto } from './stories.dto';
import { StorySource, StorySourceDocument } from './story-source.schema';
import { Story, StoryDocument } from './story.schema';
import { StoryTopic, StoryTopicDocument } from './story-topic.schema';

const MIN_SOURCE_CONTENT_LENGTH = 256;
const MAX_STORY_SHORT_CONTENT = 80_000;
const MAX_STORY_LONG_CONTENT = 500_000;
const MAX_STORY_IMAGES = 6;

@Injectable()
export class StoriesService {
  constructor(
    @InjectModel(Story.name)
    private readonly storyModel: Model<StoryDocument>,
    @InjectModel(StorySource.name)
    private readonly storySourceModel: Model<StorySourceDocument>,
    @InjectModel(StoryTopic.name)
    private readonly storyTopicModel: Model<StoryTopicDocument>,
  ) {}

  /**
   * Danh sách StorySource của user — mặc định:
   * mới nhất trước (`createdAt` desc), cùng thời điểm ưu tiên `usageCount` thấp.
   */
  async listSourcesForUser(userId: string) {
    const rows = await this.storySourceModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id sourceContent sourceReelUrl name usageCount createdAt updatedAt')
      .sort({ createdAt: -1, usageCount: 1 })
      .limit(500)
      .lean();

    return rows.map((r) => {
      const row = r as Record<string, unknown>;
      return {
        _id: String(row._id || ''),
        sourceContent: String(row.sourceContent || ''),
        sourceReelUrl: String(row.sourceReelUrl || ''),
        name: String(row.name || ''),
        usageCount: Number(row.usageCount) || 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async listForUser(userId: string, query: ListMyStoriesQuery) {
    const { page, limit, q, hasLongContent } = query;
    const userOid = new Types.ObjectId(userId);

    const baseFilter: Record<string, unknown> = { userId: userOid };
    if (hasLongContent) {
      baseFilter.longContent = { $exists: true, $nin: ['', null] };
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const or: Record<string, unknown>[] = [{ name: { $regex: escaped, $options: 'i' } }];
      if (Types.ObjectId.isValid(q)) {
        or.push({ _id: new Types.ObjectId(q) });
      }
      baseFilter.$or = or;
    }

    const populate = {
      path: 'storySourceId',
      select: 'sourceContent sourceReelUrl name usageCount',
    };

    const [total, rows] = await Promise.all([
      this.storyModel.countDocuments(baseFilter),
      this.storyModel
        .find(baseFilter)
        .populate(populate)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return {
      items: rows.map((row) =>
        this.serializeStory(row as unknown as Record<string, unknown>),
      ),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async createForUser(userId: string, dto: CreateStoryDto) {
    const sourceReelUrl = this.normalizeHttpUrl((dto.sourceReelUrl || '').trim());

    if (!sourceReelUrl) {
      throw new BadRequestException('Invalid reel URL.');
    }
    this.assertFacebookReelUrl(sourceReelUrl);

    const canonicalReelUrl = this.canonicalSourceReelUrl(sourceReelUrl);
    const userOid = new Types.ObjectId(userId);
    const sourceDoc = await this.storySourceModel
      .findOne({ userId: userOid, sourceReelUrl: canonicalReelUrl })
      .select('_id')
      .lean();
    if (!sourceDoc?._id) {
      throw new NotFoundException('Story source not found. Please sync source content first.');
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
    const shortContent = (dto.shortContent || '').trim().slice(0, MAX_STORY_SHORT_CONTENT);
    const longContent = (dto.longContent || '').trim().slice(0, MAX_STORY_LONG_CONTENT);
    const imageUrls = this.normalizeStoryImageUrls(dto.imageUrls);

    const storyPayload: {
      userId: Types.ObjectId;
      storySourceId: Types.ObjectId;
      name: string;
      shortContent: string;
      longContent: string;
      imageUrls: string[];
      topicId?: Types.ObjectId;
      videoPrompts?: string[];
    } = {
      userId: userOid,
      storySourceId: new Types.ObjectId(String(sourceDoc._id)),
      name,
      shortContent,
      longContent,
      imageUrls,
    };
    if (topicId) {
      storyPayload.topicId = topicId;
    }
    if (dto.videoPrompts !== undefined) {
      storyPayload.videoPrompts = this.normalizeVideoPrompts(dto.videoPrompts);
    }

    const created = await this.storyModel.create(storyPayload);

    const sourceAfterUsage = await this.storySourceModel.findOneAndUpdate(
      { _id: sourceDoc._id, userId: userOid },
      { $inc: { usageCount: 1 } },
      { new: true },
    )
      .lean();

    const plain = created.toObject() as unknown as Record<string, unknown>;
    plain.storySourceId = (sourceAfterUsage || sourceDoc) as unknown as Record<string, unknown>;
    return this.serializeStory(plain);
  }

  /** Lưu/cập nhật nội dung nguồn khi quét caption từ reel (không tạo Story). */
  async upsertStorySourceForUser(userId: string, dto: UpsertStorySourceDto) {
    const sourceContent = (dto.sourceContent || '').trim();
    const sourceReelUrl = this.normalizeHttpUrl((dto.sourceReelUrl || '').trim());

    if (!sourceContent) {
      throw new BadRequestException('Source content is required.');
    }
    if (sourceContent.length < MIN_SOURCE_CONTENT_LENGTH) {
      throw new BadRequestException(`Source content must be at least ${MIN_SOURCE_CONTENT_LENGTH} characters.`);
    }
    if (!sourceReelUrl) {
      throw new BadRequestException('Invalid reel URL.');
    }
    this.assertFacebookReelUrl(sourceReelUrl);

    const canonicalReelUrl = this.canonicalSourceReelUrl(sourceReelUrl);
    const userOid = new Types.ObjectId(userId);
    const doc = await this.upsertStorySourceDoc(userOid, {
      sourceReelUrl: canonicalReelUrl,
      sourceContent,
      name: (dto.name || '').trim().slice(0, 200),
    });

    return this.serializeStorySource(doc.toObject() as unknown as Record<string, unknown>);
  }

  async patchForUser(userId: string, storyId: string, dto: PatchStoryDto) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new BadRequestException('Invalid story id.');
    }
    const oid = new Types.ObjectId(storyId);
    const userOid = new Types.ObjectId(userId);
    const update: Record<string, unknown> = {};
    if (dto.videoPrompts !== undefined) {
      update.videoPrompts = this.normalizeVideoPrompts(dto.videoPrompts);
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No fields to update.');
    }
    const res = await this.storyModel
      .findOneAndUpdate({ _id: oid, userId: userOid }, { $set: update }, { new: true })
      .populate({
        path: 'storySourceId',
        select: 'sourceContent sourceReelUrl name usageCount',
      })
      .lean();
    if (!res) {
      throw new NotFoundException('Story not found.');
    }

    const sourceOid = this.extractStorySourceObjectId(res as Record<string, unknown>);
    if (sourceOid) {
      await this.storySourceModel.updateOne({ _id: sourceOid, userId: userOid }, { $inc: { usageCount: 1 } });
      const row = res as Record<string, unknown>;
      const ss = row.storySourceId;
      if (ss && typeof ss === 'object' && !Array.isArray(ss)) {
        const o = ss as Record<string, unknown>;
        o.usageCount = Number(o.usageCount || 0) + 1;
      }
    }

    return this.serializeStory(res as unknown as Record<string, unknown>);
  }

  /**
   * Đã có **StorySource** (story nguồn) cho URL reel này hay chưa — không đọc collection Story.
   */
  async checkStorySourceForReel(
    userId: string,
    rawUrl: string,
  ): Promise<{
    saved: boolean;
    storySourceId?: string;
    canonicalUrl?: string;
    myUsageCount: number;
    globalUsageCount: number;
  }> {
    const normalized = this.normalizeHttpUrl((rawUrl || '').trim());
    if (!normalized) {
      return { saved: false, myUsageCount: 0, globalUsageCount: 0 };
    }
    try {
      this.assertFacebookReelUrl(normalized);
    } catch {
      return { saved: false, myUsageCount: 0, globalUsageCount: 0 };
    }
    const canonical = this.canonicalSourceReelUrl(normalized);
    const globalUsageCount = await this.sumUsageAcrossStorySourcesForReel(canonical);
    const userOid = new Types.ObjectId(userId);

    const sourceDoc = await this.storySourceModel
      .findOne({ userId: userOid, sourceReelUrl: canonical })
      .select('_id usageCount')
      .lean();

    return {
      saved: Boolean(sourceDoc),
      storySourceId: sourceDoc ? String(sourceDoc._id) : undefined,
      canonicalUrl: canonical,
      myUsageCount: sourceDoc ? Number(sourceDoc.usageCount) || 0 : 0,
      globalUsageCount,
    };
  }

  /** +1 vào StorySource của user (theo story để xác định reel); tổng hệ thống = ∑ usageCount mọi StorySource cùng URL chuẩn. */
  async incrementUsage(userId: string, storyId: string) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new BadRequestException('Invalid story id.');
    }
    const oid = new Types.ObjectId(storyId);
    const userOid = new Types.ObjectId(userId);
    const story = await this.storyModel
      .findOne({ _id: oid, userId: userOid })
      .populate({ path: 'storySourceId', select: 'sourceReelUrl' })
      .lean();
    const row = story as Record<string, unknown> | null;

    let sourceOid: Types.ObjectId | null = null;
    let canonical = '';
    const src = row?.storySourceId;
    if (src && typeof src === 'object' && !Array.isArray(src) && '_id' in src) {
      const so = src as Record<string, unknown>;
      sourceOid = new Types.ObjectId(String(so._id));
      canonical = this.canonicalSourceReelUrl(String(so.sourceReelUrl || ''));
    } else if (row?.storySourceId) {
      sourceOid = new Types.ObjectId(String(row.storySourceId));
      const full = await this.storySourceModel.findById(sourceOid).select('sourceReelUrl').lean();
      if (full?.sourceReelUrl) {
        canonical = this.canonicalSourceReelUrl(String(full.sourceReelUrl));
      }
    }
    if ((!sourceOid || !canonical) && row?.sourceReelUrl) {
      canonical = this.canonicalSourceReelUrl(String(row.sourceReelUrl));
      const found = await this.storySourceModel
        .findOne({ userId: userOid, sourceReelUrl: canonical })
        .select('_id')
        .lean();
      if (found?._id) {
        sourceOid = found._id as Types.ObjectId;
      }
    }
    if (!sourceOid || !canonical) {
      throw new NotFoundException('Story not found.');
    }

    await this.storySourceModel.updateOne(
      { _id: sourceOid, userId: userOid },
      { $inc: { usageCount: 1 } },
    );

    const updatedSrc = await this.storySourceModel.findById(sourceOid).select('usageCount').lean();
    const globalUsageCount = await this.sumUsageAcrossStorySourcesForReel(canonical);

    return {
      storyId: String(oid),
      canonicalUrl: canonical,
      myUsageCount: Number(updatedSrc?.usageCount) || 0,
      globalUsageCount,
    };
  }

  /** Tổng lượt dùng toàn hệ thống cho một reel = ∑ usageCount trên mọi StorySource trùng sourceReelUrl. */
  private async sumUsageAcrossStorySourcesForReel(canonicalReelUrl: string): Promise<number> {
    const agg = await this.storySourceModel
      .aggregate<{ total?: number }>([
        { $match: { sourceReelUrl: canonicalReelUrl } },
        { $group: { _id: null, total: { $sum: '$usageCount' } } },
      ])
      .exec();
    return Number(agg[0]?.total) || 0;
  }

  private async upsertStorySourceDoc(
    userOid: Types.ObjectId,
    params: { sourceReelUrl: string; sourceContent: string; name: string },
  ) {
    const name = params.name.slice(0, 200);
    const doc = await this.storySourceModel.findOneAndUpdate(
      { userId: userOid, sourceReelUrl: params.sourceReelUrl },
      {
        $set: {
          sourceContent: params.sourceContent,
          name,
        },
      },
      { upsert: true, new: true },
    );
    if (!doc) {
      throw new NotFoundException('Could not upsert story source.');
    }
    return doc;
  }

  private extractStorySourceObjectId(row: Record<string, unknown>): Types.ObjectId | null {
    const ss = row.storySourceId;
    if (ss && typeof ss === 'object' && !Array.isArray(ss) && '_id' in ss) {
      const id = (ss as Record<string, unknown>)._id;
      if (id && Types.ObjectId.isValid(String(id))) {
        return new Types.ObjectId(String(id));
      }
    }
    if (ss && Types.ObjectId.isValid(String(ss))) {
      return new Types.ObjectId(String(ss));
    }
    return null;
  }

  private serializeStorySource(row: Record<string, unknown>) {
    const id = String(row._id || '');
    const userId = row.userId ? String(row.userId) : '';
    return {
      _id: id,
      userId,
      name: (row.name as string) || '',
      sourceContent: (row.sourceContent as string) || '',
      sourceReelUrl: (row.sourceReelUrl as string) || '',
      usageCount: Number(row.usageCount) || 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeStory(row: Record<string, unknown>) {
    const id = String(row._id || '');
    const userId = row.userId ? String(row.userId) : '';
    const topicId = row.topicId ? String(row.topicId) : '';
    const ss = row.storySourceId;
    let storySourceIdStr = '';
    let sourceContent = '';
    let sourceReelUrl = '';
    let usageCount = 0;
    if (ss && typeof ss === 'object' && !Array.isArray(ss)) {
      const o = ss as Record<string, unknown>;
      storySourceIdStr = o._id ? String(o._id) : '';
      sourceContent = (o.sourceContent as string) || '';
      sourceReelUrl = (o.sourceReelUrl as string) || '';
      usageCount = Number(o.usageCount) || 0;
    } else if (ss) {
      storySourceIdStr = String(ss);
    }
    if (!sourceContent && row.sourceContent) {
      sourceContent = (row.sourceContent as string) || '';
    }
    if (!sourceReelUrl && row.sourceReelUrl) {
      sourceReelUrl = (row.sourceReelUrl as string) || '';
    }
    return {
      _id: id,
      userId,
      topicId,
      storySourceId: storySourceIdStr,
      name: (row.name as string) || '',
      shortContent: (row.shortContent as string) || '',
      longContent: (row.longContent as string) || '',
      sourceContent,
      sourceReelUrl,
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
      usageCount,
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

  /** Chỉ nhận URL https (ưu tiên Cloudinary CDN). */
  private normalizeStoryImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const raw of value) {
      if (out.length >= MAX_STORY_IMAGES) break;
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) continue;
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'https:') continue;
        const host = parsed.hostname.toLowerCase();
        if (!host.includes('cloudinary')) continue;
        out.push(parsed.toString());
      } catch {
        continue;
      }
    }
    return out;
  }

  private normalizeVideoPrompts(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('videoPrompts must be an array.');
    }
    const maxItems = 32;
    return value
      .slice(0, maxItems)
      .map((s) => String(s ?? '').trim().slice(0, 50_000));
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
