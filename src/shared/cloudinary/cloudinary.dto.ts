/** Nhóm thư mục upload — path `ai-content/{subfolder}/{userId}`. */
export const CLOUDINARY_UPLOAD_SUBFOLDERS = ['stories', 'general'] as const;

export type CloudinaryUploadSubfolder = (typeof CLOUDINARY_UPLOAD_SUBFOLDERS)[number];

export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto';

export class SignCloudinaryUploadDto {
  /** Mặc định `general` → `ai-content/general/{userId}`. */
  subfolder?: CloudinaryUploadSubfolder;

  resourceType?: CloudinaryResourceType;
}
