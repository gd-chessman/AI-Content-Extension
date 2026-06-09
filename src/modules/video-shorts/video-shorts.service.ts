import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateVideoShortDto, ListMyVideoShortsQuery, PatchVideoShortDto, SkipVideoShortSourceDto, UpsertVideoShortSourceDto } from './video-shorts.dto';
import { VideoShortSource, VideoShortSourceDocument } from './video-short-source.schema';
import { VideoShort, VideoShortDocument } from './video-short.schema';
import { VideoShortTopic, VideoShortTopicDocument } from './video-short-topic.schema';
import { GgSheetService } from '../ggsheet/ggsheet.service';
import {
  buildVideoShortPipelineMongoFilter,
  isPostFilterPipelineStatus,
  matchesVideoShortPipelineStatus,
  parseVideoShortPipelineStatus,
  type VideoShortPipelineStatus,
} from './video-short-pipeline-status';

const MIN_SOURCE_CONTENT_LENGTH = 256;
const MAX_STORY_SHORT_CONTENT = 80_000;
const MAX_STORY_LONG_CONTENT = 500_000;
const MAX_STORY_IMAGES = 6;

@Injectable()
export class VideoShortsService {
  constructor(
    @InjectModel(VideoShort.name)
    private readonly storyModel: Model<VideoShortDocument>,
    @InjectModel(VideoShortSource.name)
    private readonly videoShortSourceModel: Model<VideoShortSourceDocument>,
    @InjectModel(VideoShortTopic.name)
    private readonly storyTopicModel: Model<VideoShortTopicDocument>,
    private readonly ggSheetService: GgSheetService,
  ) {}

  /**
   * Danh sách VideoShortSource của user — mặc định:
   * mới nhất trước (`createdAt` desc), cùng thời điểm ưu tiên `usageCount` thấp.
   */
  async listSourcesForUser(userId: string) {
    const rows = await this.videoShortSourceModel
      .find({ userId: new Types.ObjectId(userId) })
      .select('_id sourceContent sourceReelUrl name usageCount skipReason createdAt updatedAt')
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
        skipReason: String(row.skipReason || ''),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async listForUser(userId: string, query: ListMyVideoShortsQuery) {
    const { page, limit, q } = query;
    const pipelineStatus = parseVideoShortPipelineStatus(query.status);

    if (isPostFilterPipelineStatus(pipelineStatus)) {
      return this.listForUserWithPipelinePostFilter(userId, query, pipelineStatus);
    }

    const userOid = new Types.ObjectId(userId);
    const baseFilter: Record<string, unknown> = { userId: userOid };

    if (!pipelineStatus && query.hasLongContent) {
      baseFilter.longContent = { $exists: true, $nin: ['', null] };
    }

    if (pipelineStatus) {
      const pipelineFilter = buildVideoShortPipelineMongoFilter(pipelineStatus);
      if (pipelineFilter) {
        Object.assign(baseFilter, pipelineFilter);
      }
    }

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const or: Record<string, unknown>[] = [{ name: { $regex: escaped, $options: 'i' } }];
      if (Types.ObjectId.isValid(q)) {
        or.push({ _id: new Types.ObjectId(q) });
      }
      baseFilter.$or = or;
    }

    return this.paginateVideoShortsForUser(userId, baseFilter, page, limit);
  }

  private async listForUserWithPipelinePostFilter(
    userId: string,
    query: ListMyVideoShortsQuery,
    pipelineStatus: VideoShortPipelineStatus,
  ) {
    const { page, limit, q } = query;
    const userOid = new Types.ObjectId(userId);
    const baseFilter: Record<string, unknown> = { userId: userOid };

    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const or: Record<string, unknown>[] = [{ name: { $regex: escaped, $options: 'i' } }];
      if (Types.ObjectId.isValid(q)) {
        or.push({ _id: new Types.ObjectId(q) });
      }
      baseFilter.$or = or;
    }

    const populate = {
      path: 'videoShortSourceId',
      select: 'sourceContent sourceReelUrl name usageCount',
    };

    const rows = await this.storyModel
      .find(baseFilter)
      .populate(populate)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const serialized = rows.map((row) =>
      this.serializeVideoShort(row as unknown as Record<string, unknown>),
    );
    const ggsheetMap = await this.ggSheetService.getPushStatusMapForStories(
      userId,
      serialized.map((item) => ({
        videoShortId: item._id,
        title: item.name,
        shortContent: item.shortContent,
      })),
    );

    const filtered = serialized
      .map((item) => ({
        ...item,
        ggsheetPush: ggsheetMap.get(item._id) || { pushed: false },
      }))
      .filter((item) => matchesVideoShortPipelineStatus(item, pipelineStatus));

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  private async paginateVideoShortsForUser(
    userId: string,
    baseFilter: Record<string, unknown>,
    page: number,
    limit: number,
  ) {
    const populate = {
      path: 'videoShortSourceId',
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

    const serialized = rows.map((row) =>
      this.serializeVideoShort(row as unknown as Record<string, unknown>),
    );
    const ggsheetMap = await this.ggSheetService.getPushStatusMapForStories(
      userId,
      serialized.map((item) => ({
        videoShortId: item._id,
        title: item.name,
        shortContent: item.shortContent,
      })),
    );

    return {
      items: serialized.map((item) => ({
        ...item,
        ggsheetPush: ggsheetMap.get(item._id) || { pushed: false },
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async createForUser(userId: string, dto: CreateVideoShortDto) {
    const sourceReelUrl = this.normalizeHttpUrl((dto.sourceReelUrl || '').trim());

    if (!sourceReelUrl) {
      throw new BadRequestException('Invalid reel URL.');
    }
    this.assertFacebookReelUrl(sourceReelUrl);

    const canonicalReelUrl = this.canonicalSourceReelUrl(sourceReelUrl);
    const userOid = new Types.ObjectId(userId);
    const sourceDoc = await this.videoShortSourceModel
      .findOne({ userId: userOid, sourceReelUrl: canonicalReelUrl })
      .select('_id')
      .lean();
    if (!sourceDoc?._id) {
      throw new NotFoundException('VideoShort source not found. Please sync source content first.');
    }

    let videoShortTopicId: Types.ObjectId | undefined;
    if (dto.videoShortTopicId?.trim()) {
      const raw = dto.videoShortTopicId.trim();
      if (!Types.ObjectId.isValid(raw)) {
        throw new BadRequestException('Invalid videoShortTopicId.');
      }
      const topic = await this.storyTopicModel.findById(raw).lean();
      if (!topic) {
        throw new NotFoundException('Topic not found.');
      }
      const topicUser = topic.userId ? String(topic.userId) : '';
      if (topicUser && topicUser !== userId) {
        throw new ForbiddenException("You cannot use another user's topic.");
      }
      videoShortTopicId = new Types.ObjectId(raw);
    }

    const name = (dto.name || '').trim().slice(0, 200);
    const shortContent = (dto.shortContent || '').trim().slice(0, MAX_STORY_SHORT_CONTENT);
    const longContent = (dto.longContent || '').trim().slice(0, MAX_STORY_LONG_CONTENT);
    const imageUrls = this.normalizeVideoShortImageUrls(dto.imageUrls);

    const storyPayload: {
      userId: Types.ObjectId;
      videoShortSourceId: Types.ObjectId;
      name: string;
      shortContent: string;
      longContent: string;
      imageUrls: string[];
      videoShortTopicId?: Types.ObjectId;
      videoPrompts?: string[];
    } = {
      userId: userOid,
      videoShortSourceId: new Types.ObjectId(String(sourceDoc._id)),
      name,
      shortContent,
      longContent,
      imageUrls,
    };
    if (videoShortTopicId) {
      storyPayload.videoShortTopicId = videoShortTopicId;
    }
    if (dto.videoPrompts !== undefined) {
      storyPayload.videoPrompts = this.normalizeVideoPrompts(dto.videoPrompts);
    }

    const created = await this.storyModel.create(storyPayload);

    const sourceAfterUsage = await this.videoShortSourceModel.findOneAndUpdate(
      { _id: sourceDoc._id, userId: userOid },
      { $inc: { usageCount: 1 } },
      { new: true },
    )
      .lean();

    const plain = created.toObject() as unknown as Record<string, unknown>;
    plain.videoShortSourceId = (sourceAfterUsage || sourceDoc) as unknown as Record<string, unknown>;
    return this.serializeVideoShort(plain);
  }

  /** Lưu/cập nhật nội dung nguồn khi quét caption từ reel (không tạo VideoShort). */
  async upsertVideoShortSourceForUser(userId: string, dto: UpsertVideoShortSourceDto) {
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
    const doc = await this.upsertVideoShortSourceDoc(userOid, {
      sourceReelUrl: canonicalReelUrl,
      sourceContent,
      name: (dto.name || '').trim().slice(0, 200),
    });

    return this.serializeVideoShortSource(doc.toObject() as unknown as Record<string, unknown>);
  }

  /** Đánh dấu reel bỏ qua (caption timeout, v.v.) — loại khỏi workflow chọn reel. */
  async skipVideoShortSourceForUser(userId: string, dto: SkipVideoShortSourceDto) {
    const sourceReelUrl = this.normalizeHttpUrl((dto.sourceReelUrl || '').trim());
    if (!sourceReelUrl) {
      throw new BadRequestException('Invalid reel URL.');
    }
    this.assertFacebookReelUrl(sourceReelUrl);

    const canonicalReelUrl = this.canonicalSourceReelUrl(sourceReelUrl);
    const userOid = new Types.ObjectId(userId);
    const reason = (dto.reason || 'caption_timeout').trim() || 'caption_timeout';
    const name = (dto.name || '').trim().slice(0, 200);

    const existing = await this.videoShortSourceModel
      .findOne({ userId: userOid, sourceReelUrl: canonicalReelUrl })
      .lean();

    if (
      existing &&
      (existing.sourceContent || '').trim().length >= MIN_SOURCE_CONTENT_LENGTH &&
      !(existing.skipReason || '').trim()
    ) {
      return this.serializeVideoShortSource(existing as unknown as Record<string, unknown>);
    }

    const doc = await this.videoShortSourceModel.findOneAndUpdate(
      { userId: userOid, sourceReelUrl: canonicalReelUrl },
      {
        $set: {
          skipReason: reason,
          name: name || String(existing?.name || ''),
          sourceContent: '',
        },
      },
      { upsert: true, new: true },
    );
    if (!doc) {
      throw new NotFoundException('Could not skip story source.');
    }

    return this.serializeVideoShortSource(doc.toObject() as unknown as Record<string, unknown>);
  }

  /** VideoShort mới nhất (≤ maxAgeMs) có ít nhất 1 videoPrompt và 1 imageUrl — dùng cho Grok khi thiếu videoShortId. */
  async getLatestGrokReadyForUser(userId: string, options: { maxAgeMs: number }) {
    const userOid = new Types.ObjectId(userId);
    const since = new Date(Date.now() - options.maxAgeMs);

    const rows = await this.storyModel
      .find({
        userId: userOid,
        createdAt: { $gte: since },
        'videoPrompts.0': { $exists: true },
        'imageUrls.0': { $exists: true },
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate({
        path: 'videoShortSourceId',
        select: 'sourceContent sourceReelUrl name usageCount',
      })
      .lean();

    const row = rows.find((item) => {
      const r = item as Record<string, unknown>;
      const prompts = this.normalizeVideoPrompts((r.videoPrompts as string[]) || []);
      const images = this.normalizeVideoShortImageUrls((r.imageUrls as string[]) || []);
      return prompts.length > 0 && images.length > 0;
    });

    if (!row) {
      throw new NotFoundException(
        'No recent story with video prompts and images found (within the allowed time window).',
      );
    }

    return this.serializeVideoShort(row as unknown as Record<string, unknown>);
  }

  async getByIdForUser(userId: string, videoShortId: string) {
    if (!Types.ObjectId.isValid(videoShortId)) {
      throw new BadRequestException('Invalid story id.');
    }
    const userOid = new Types.ObjectId(userId);
    const row = await this.storyModel
      .findOne({ _id: new Types.ObjectId(videoShortId), userId: userOid })
      .populate({
        path: 'videoShortSourceId',
        select: 'sourceContent sourceReelUrl name usageCount',
      })
      .lean();
    if (!row) {
      throw new NotFoundException('VideoShort not found.');
    }
    const serialized = this.serializeVideoShort(row as unknown as Record<string, unknown>);
    const ggsheetPush = await this.ggSheetService.getPushStatusForVideoShort(
      userId,
      serialized.name,
      serialized.shortContent,
    );
    return { ...serialized, ggsheetPush };
  }

  async patchForUser(userId: string, videoShortId: string, dto: PatchVideoShortDto) {
    if (!Types.ObjectId.isValid(videoShortId)) {
      throw new BadRequestException('Invalid story id.');
    }
    const oid = new Types.ObjectId(videoShortId);
    const userOid = new Types.ObjectId(userId);
    const update: Record<string, unknown> = {};
    if (dto.videoPrompts !== undefined) {
      update.videoPrompts = this.normalizeVideoPrompts(dto.videoPrompts);
    }
    if (dto.videoStorageAddresses !== undefined) {
      update.videoStorageAddresses = this.normalizeVideoStorageAddresses(dto.videoStorageAddresses);
    }
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No fields to update.');
    }
    const res = await this.storyModel
      .findOneAndUpdate({ _id: oid, userId: userOid }, { $set: update }, { new: true })
      .populate({
        path: 'videoShortSourceId',
        select: 'sourceContent sourceReelUrl name usageCount',
      })
      .lean();
    if (!res) {
      throw new NotFoundException('VideoShort not found.');
    }

    const sourceOid = this.extractVideoShortSourceObjectId(res as Record<string, unknown>);
    if (sourceOid) {
      await this.videoShortSourceModel.updateOne({ _id: sourceOid, userId: userOid }, { $inc: { usageCount: 1 } });
      const row = res as Record<string, unknown>;
      const ss = row.videoShortSourceId;
      if (ss && typeof ss === 'object' && !Array.isArray(ss)) {
        const o = ss as Record<string, unknown>;
        o.usageCount = Number(o.usageCount || 0) + 1;
      }
    }

    return this.serializeVideoShort(res as unknown as Record<string, unknown>);
  }

  /**
   * Đã có **VideoShortSource** (story nguồn) cho URL reel này hay chưa — không đọc collection VideoShort.
   */
  async checkVideoShortSourceForReel(
    userId: string,
    rawUrl: string,
  ): Promise<{
    saved: boolean;
    videoShortSourceId?: string;
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
    const globalUsageCount = await this.sumUsageAcrossVideoShortSourcesForReel(canonical);
    const userOid = new Types.ObjectId(userId);

    const sourceDoc = await this.videoShortSourceModel
      .findOne({ userId: userOid, sourceReelUrl: canonical })
      .select('_id usageCount')
      .lean();

    return {
      saved: Boolean(sourceDoc),
      videoShortSourceId: sourceDoc ? String(sourceDoc._id) : undefined,
      canonicalUrl: canonical,
      myUsageCount: sourceDoc ? Number(sourceDoc.usageCount) || 0 : 0,
      globalUsageCount,
    };
  }

  /** +1 vào VideoShortSource của user (theo story để xác định reel); tổng hệ thống = ∑ usageCount mọi VideoShortSource cùng URL chuẩn. */
  async incrementUsage(userId: string, videoShortId: string) {
    if (!Types.ObjectId.isValid(videoShortId)) {
      throw new BadRequestException('Invalid story id.');
    }
    const oid = new Types.ObjectId(videoShortId);
    const userOid = new Types.ObjectId(userId);
    const story = await this.storyModel
      .findOne({ _id: oid, userId: userOid })
      .populate({ path: 'videoShortSourceId', select: 'sourceReelUrl' })
      .lean();
    const row = story as Record<string, unknown> | null;

    let sourceOid: Types.ObjectId | null = null;
    let canonical = '';
    const src = row?.videoShortSourceId;
    if (src && typeof src === 'object' && !Array.isArray(src) && '_id' in src) {
      const so = src as Record<string, unknown>;
      sourceOid = new Types.ObjectId(String(so._id));
      canonical = this.canonicalSourceReelUrl(String(so.sourceReelUrl || ''));
    } else if (row?.videoShortSourceId) {
      sourceOid = new Types.ObjectId(String(row.videoShortSourceId));
      const full = await this.videoShortSourceModel.findById(sourceOid).select('sourceReelUrl').lean();
      if (full?.sourceReelUrl) {
        canonical = this.canonicalSourceReelUrl(String(full.sourceReelUrl));
      }
    }
    if ((!sourceOid || !canonical) && row?.sourceReelUrl) {
      canonical = this.canonicalSourceReelUrl(String(row.sourceReelUrl));
      const found = await this.videoShortSourceModel
        .findOne({ userId: userOid, sourceReelUrl: canonical })
        .select('_id')
        .lean();
      if (found?._id) {
        sourceOid = found._id as Types.ObjectId;
      }
    }
    if (!sourceOid || !canonical) {
      throw new NotFoundException('VideoShort not found.');
    }

    await this.videoShortSourceModel.updateOne(
      { _id: sourceOid, userId: userOid },
      { $inc: { usageCount: 1 } },
    );

    const updatedSrc = await this.videoShortSourceModel.findById(sourceOid).select('usageCount').lean();
    const globalUsageCount = await this.sumUsageAcrossVideoShortSourcesForReel(canonical);

    return {
      videoShortId: String(oid),
      canonicalUrl: canonical,
      myUsageCount: Number(updatedSrc?.usageCount) || 0,
      globalUsageCount,
    };
  }

  /** Tổng lượt dùng toàn hệ thống cho một reel = ∑ usageCount trên mọi VideoShortSource trùng sourceReelUrl. */
  private async sumUsageAcrossVideoShortSourcesForReel(canonicalReelUrl: string): Promise<number> {
    const agg = await this.videoShortSourceModel
      .aggregate<{ total?: number }>([
        { $match: { sourceReelUrl: canonicalReelUrl } },
        { $group: { _id: null, total: { $sum: '$usageCount' } } },
      ])
      .exec();
    return Number(agg[0]?.total) || 0;
  }

  private async upsertVideoShortSourceDoc(
    userOid: Types.ObjectId,
    params: { sourceReelUrl: string; sourceContent: string; name: string },
  ) {
    const name = params.name.slice(0, 200);
    const doc = await this.videoShortSourceModel.findOneAndUpdate(
      { userId: userOid, sourceReelUrl: params.sourceReelUrl },
      {
        $set: {
          sourceContent: params.sourceContent,
          name,
          skipReason: '',
        },
      },
      { upsert: true, new: true },
    );
    if (!doc) {
      throw new NotFoundException('Could not upsert story source.');
    }
    return doc;
  }

  private extractVideoShortSourceObjectId(row: Record<string, unknown>): Types.ObjectId | null {
    const ss = row.videoShortSourceId;
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

  private serializeVideoShortSource(row: Record<string, unknown>) {
    const id = String(row._id || '');
    const userId = row.userId ? String(row.userId) : '';
    return {
      _id: id,
      userId,
      name: (row.name as string) || '',
      sourceContent: (row.sourceContent as string) || '',
      sourceReelUrl: (row.sourceReelUrl as string) || '',
      usageCount: Number(row.usageCount) || 0,
      skipReason: String(row.skipReason || ''),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private serializeVideoShort(row: Record<string, unknown>) {
    const id = String(row._id || '');
    const userId = row.userId ? String(row.userId) : '';
    const videoShortTopicId = row.videoShortTopicId ? String(row.videoShortTopicId) : '';
    const ss = row.videoShortSourceId;
    let videoShortSourceIdStr = '';
    let sourceContent = '';
    let sourceReelUrl = '';
    let usageCount = 0;
    if (ss && typeof ss === 'object' && !Array.isArray(ss)) {
      const o = ss as Record<string, unknown>;
      videoShortSourceIdStr = o._id ? String(o._id) : '';
      sourceContent = (o.sourceContent as string) || '';
      sourceReelUrl = (o.sourceReelUrl as string) || '';
      usageCount = Number(o.usageCount) || 0;
    } else if (ss) {
      videoShortSourceIdStr = String(ss);
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
      videoShortTopicId,
      videoShortSourceId: videoShortSourceIdStr,
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
  private normalizeVideoShortImageUrls(value: unknown): string[] {
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

  private normalizeVideoStorageAddresses(value: unknown): string[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('videoStorageAddresses must be an array.');
    }
    const maxItems = 32;
    return value.slice(0, maxItems).map((raw) => {
      const trimmed = String(raw ?? '').trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('local:')) {
        const path = trimmed.slice('local:'.length).trim();
        if (!path || path.length > 500) return '';
        if (/[\x00-\x1f<>:"|?*]/.test(path)) return '';
        return `local:${path}`;
      }
      try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
        return parsed.toString();
      } catch {
        return '';
      }
    });
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
