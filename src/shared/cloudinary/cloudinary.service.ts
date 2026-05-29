import {
  BadRequestException,
  Injectable,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinarySdk, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import {
  CLOUDINARY_UPLOAD_SUBFOLDERS,
  CloudinaryResourceType,
  CloudinaryUploadSubfolder,
} from './cloudinary.dto';

export type CloudinarySignedUploadParams = {
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  resourceType: CloudinaryResourceType;
  subfolder: CloudinaryUploadSubfolder;
};

export type CreateSignedUploadOptions = {
  subfolder?: CloudinaryUploadSubfolder;
  resourceType?: CloudinaryResourceType;
};

const RESOURCE_TYPES: CloudinaryResourceType[] = ['image', 'video', 'raw', 'auto'];

@Injectable()
export class CloudinaryService {
  private readonly cloudName: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(
    @Inject('CLOUDINARY') private readonly cloudinary: typeof cloudinarySdk,
    configService: ConfigService,
  ) {
    this.cloudName = (configService.get<string>('CLOUDINARY_CLOUD_NAME') || '').trim();
    this.apiKey = (configService.get<string>('CLOUDINARY_API_KEY') || '').trim();
    this.apiSecret = (configService.get<string>('CLOUDINARY_API_SECRET') || '').trim();
  }

  isConfigured(): boolean {
    return Boolean(this.cloudName && this.apiKey && this.apiSecret);
  }

  /** Chữ ký upload trực tiếp — path `ai-content/{subfolder}/{userId}`. */
  createSignedUploadParams(
    userId: string,
    options?: CreateSignedUploadOptions,
  ): CloudinarySignedUploadParams {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Cloudinary chưa cấu hình (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET).',
      );
    }

    const subfolder = this.normalizeSubfolder(options?.subfolder);
    const resourceType = this.normalizeResourceType(options?.resourceType);
    const folder = this.resolveUploadFolder(userId, subfolder);
    const timestamp = Math.round(Date.now() / 1000);
    const paramsToSign = { timestamp, folder };
    const signature = this.cloudinary.utils.api_sign_request(paramsToSign, this.apiSecret);

    return {
      cloudName: this.cloudName,
      apiKey: this.apiKey,
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`,
      timestamp,
      signature,
      folder,
      resourceType,
      subfolder,
    };
  }

  createSignedStoryImageUploadParams(userId: string): CloudinarySignedUploadParams {
    return this.createSignedUploadParams(userId, { subfolder: 'stories', resourceType: 'image' });
  }

  /** Parse URL delivery Cloudinary → public_id + loại resource (image/video). */
  parseDeliveryUrl(url: string): { publicId: string; resourceType: 'image' | 'video' } | null {
    const trimmed = (url || '').trim();
    if (!trimmed) return null;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:') return null;
      if (!parsed.hostname.toLowerCase().includes('cloudinary.com')) return null;

      const pathMatch = parsed.pathname.match(/\/(image|video)\/upload\/(.+)$/i);
      if (!pathMatch) return null;

      const resourceType = pathMatch[1].toLowerCase() as 'image' | 'video';
      const segments = pathMatch[2].split('/').filter(Boolean);
      const publicSegments: string[] = [];

      for (const segment of segments) {
        if (/^v\d+$/i.test(segment)) continue;
        if (this.isCloudinaryTransformSegment(segment)) continue;
        publicSegments.push(segment);
      }

      const joined = decodeURIComponent(publicSegments.join('/')).trim();
      if (!joined) return null;

      const publicId = joined.replace(/\.[a-z0-9]+$/i, '');
      return publicId ? { publicId, resourceType } : null;
    } catch {
      return null;
    }
  }

  async destroyByDeliveryUrl(url: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const asset = this.parseDeliveryUrl(url);
    if (!asset) return false;

    try {
      const result = await this.cloudinary.uploader.destroy(asset.publicId, {
        resource_type: asset.resourceType,
        invalidate: true,
      });
      return result.result === 'ok' || result.result === 'not found';
    } catch {
      return false;
    }
  }

  async destroyManyByDeliveryUrls(urls: string[]): Promise<{
    attempted: number;
    deleted: number;
    failed: number;
    skipped: number;
  }> {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
    let deleted = 0;
    let failed = 0;
    let skipped = 0;

    if (!this.isConfigured()) {
      return { attempted: unique.length, deleted: 0, failed: 0, skipped: unique.length };
    }

    for (const url of unique) {
      const asset = this.parseDeliveryUrl(url);
      if (!asset) {
        skipped += 1;
        continue;
      }
      const ok = await this.destroyByDeliveryUrl(url);
      if (ok) deleted += 1;
      else failed += 1;
    }

    return { attempted: unique.length, deleted, failed, skipped };
  }

  async uploadImage(file: Express.Multer.File, folder = 'my_images'): Promise<UploadApiResponse> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Cloudinary chưa cấu hình.');
    }
    return new Promise((resolve, reject) => {
      this.cloudinary.uploader
        .upload_stream(
          { folder },
          (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
            if (error) return reject(error);
            if (!result) {
              return reject(new BadRequestException('Cloudinary upload returned empty result.'));
            }
            resolve(result);
          },
        )
        .end(file.buffer);
    });
  }

  private normalizeSubfolder(value?: string): CloudinaryUploadSubfolder {
    const raw = (value || 'general').trim().toLowerCase();
    return CLOUDINARY_UPLOAD_SUBFOLDERS.includes(raw as CloudinaryUploadSubfolder)
      ? (raw as CloudinaryUploadSubfolder)
      : 'general';
  }

  private normalizeResourceType(value?: string): CloudinaryResourceType {
    const raw = (value || 'image').trim().toLowerCase();
    return RESOURCE_TYPES.includes(raw as CloudinaryResourceType)
      ? (raw as CloudinaryResourceType)
      : 'image';
  }

  private sanitizeUserId(value: string): string {
    return String(value || '')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 48);
  }

  private resolveUploadFolder(userId: string, subfolder: CloudinaryUploadSubfolder): string {
    const safeUser = this.sanitizeUserId(userId) || 'anonymous';
    return `ai-content/${subfolder}/${safeUser}`;
  }

  /** Bỏ qua segment biến đổi ảnh (w_400,h_300,c_fill …). */
  private isCloudinaryTransformSegment(segment: string): boolean {
    if (segment.includes(',')) return true;
    if (!segment.includes('_')) return false;
    if (/\.[a-z0-9]+$/i.test(segment)) return false;
    return /^(w_|h_|c_|q_|f_|g_|b_|dpr_|ar_)/i.test(segment) || segment.split('_').length >= 2;
  }
}
