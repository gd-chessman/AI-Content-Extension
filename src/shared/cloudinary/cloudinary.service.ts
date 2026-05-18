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
}
