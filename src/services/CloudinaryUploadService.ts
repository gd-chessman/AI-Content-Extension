import axiosClient from '@/utils/axiosClient'

/** Khớp BE — path `ai-content/{subfolder}/{userId}`. */
export const CLOUDINARY_UPLOAD_SUBFOLDERS = ['stories', 'general'] as const

export type CloudinaryUploadSubfolder = (typeof CLOUDINARY_UPLOAD_SUBFOLDERS)[number]

export type CloudinaryResourceType = 'image' | 'video' | 'raw' | 'auto'

export type CloudinarySignedUploadParams = {
  cloudName: string
  apiKey: string
  uploadUrl: string
  timestamp: number
  signature: string
  folder: string
  resourceType: CloudinaryResourceType
  subfolder: CloudinaryUploadSubfolder
}

export type CloudinaryUploadResult = {
  secure_url?: string
  url?: string
  public_id?: string
  error?: { message?: string }
}

export type GetCloudinaryUploadSignatureOptions = {
  /** Mặc định `general`. */
  subfolder?: CloudinaryUploadSubfolder
  resourceType?: CloudinaryResourceType
}

export const getCloudinaryUploadSignature = async (
  options: GetCloudinaryUploadSignatureOptions = {},
) => {
  const response = await axiosClient.post<CloudinarySignedUploadParams>(
    '/uploads/cloudinary/signature',
    {
      subfolder: options.subfolder ?? 'general',
      resourceType: options.resourceType ?? 'image',
    },
  )
  return response.data
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const trimmed = dataUrl.trim()
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/i)
  if (!match) {
    throw new Error('Dữ liệu ảnh không phải data URL hợp lệ.')
  }
  const mime = match[1] || 'image/jpeg'
  const binary = atob(match[2])
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

export async function uploadBlobToCloudinary(
  blob: Blob,
  signature: CloudinarySignedUploadParams,
  fileName = 'upload.jpg',
): Promise<string> {
  const formData = new FormData()
  formData.append('file', blob, fileName)
  formData.append('api_key', signature.apiKey)
  formData.append('timestamp', String(signature.timestamp))
  formData.append('signature', signature.signature)
  formData.append('folder', signature.folder)

  const response = await fetch(signature.uploadUrl, {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json()) as CloudinaryUploadResult
  if (!response.ok) {
    const msg = payload?.error?.message || `Cloudinary upload failed (${response.status})`
    throw new Error(msg)
  }

  const url = (payload.secure_url || payload.url || '').trim()
  if (!url) {
    throw new Error('Cloudinary không trả về secure_url.')
  }
  return url
}

export async function uploadDataUrlToCloudinary(
  dataUrl: string,
  signature: CloudinarySignedUploadParams,
  fileName = 'upload.jpg',
): Promise<string> {
  return uploadBlobToCloudinary(dataUrlToBlob(dataUrl), signature, fileName)
}

export async function uploadDataUrlsToCloudinary(
  dataUrls: string[],
  options: GetCloudinaryUploadSignatureOptions = {},
): Promise<string[]> {
  const sources = dataUrls.map((u) => u.trim()).filter(Boolean)
  if (sources.length === 0) return []

  const signature = await getCloudinaryUploadSignature(options)
  const label = options.subfolder ?? 'general'
  const urls: string[] = []
  for (let i = 0; i < sources.length; i += 1) {
    const url = await uploadDataUrlToCloudinary(
      sources[i],
      signature,
      `${label}-${Date.now()}-${i}.jpg`,
    )
    urls.push(url)
  }
  return urls
}

export const uploadStoryImagesFromDataUrls = (dataUrls: string[]) =>
  uploadDataUrlsToCloudinary(dataUrls, { subfolder: 'stories', resourceType: 'image' })
