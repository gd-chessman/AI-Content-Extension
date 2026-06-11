import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

const FFMPEG_CORE_VERSION = '0.12.6'
const FFMPEG_CORE_BASE = `https://unpkg.com/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

let ffmpegLoadPromise: Promise<FFmpeg> | null = null

async function getFfmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const ffmpeg = new FFmpeg()
      if (onProgress) {
        ffmpeg.on('progress', ({ progress }) => {
          if (Number.isFinite(progress)) onProgress(progress)
        })
      }
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })()
  }
  return ffmpegLoadPromise
}

export const MERGED_VIDEO_FILENAME = 'video-merged.mp4'

export function mergedVideoRelativePathFromEntry(entry: string): string | null {
  const trimmed = entry.trim()
  if (!trimmed.startsWith('local:')) return null
  const relative = trimmed.slice('local:'.length).trim()
  if (!relative) return null
  const parts = relative.split('/').filter(Boolean)
  if (parts.length < 2) return null
  parts[parts.length - 1] = MERGED_VIDEO_FILENAME
  return parts.join('/')
}

export function upsertMergedVideoAddress(addresses: string[] | undefined, mergedRelativePath: string): string[] {
  const mergedEntry = `local:${mergedRelativePath}`
  const next = [...(addresses || [])]
  const existingIdx = next.findIndex((entry) => entry.trim().endsWith(MERGED_VIDEO_FILENAME))
  if (existingIdx >= 0) {
    next[existingIdx] = mergedEntry
    return next
  }
  next.push(mergedEntry)
  return next
}

export function isMergedVideoEntry(entry: string): boolean {
  return entry.trim().endsWith(MERGED_VIDEO_FILENAME)
}

/** Ghép 2 file MP4 local thành một (video 1 rồi video 2). */
export async function mergeMp4Files(
  first: File,
  second: File,
  options?: { onProgress?: (ratio: number) => void },
): Promise<Blob> {
  const ffmpeg = await getFfmpeg(options?.onProgress)
  await ffmpeg.writeFile('v1.mp4', await fetchFile(first))
  await ffmpeg.writeFile('v2.mp4', await fetchFile(second))

  const run = async (args: string[]) => ffmpeg.exec(args)

  let exitCode = await run([
    '-i',
    'v1.mp4',
    '-i',
    'v2.mp4',
    '-filter_complex',
    '[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=2:v=1:a=1[v][a]',
    '-map',
    '[v]',
    '-map',
    '[a]',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    'out.mp4',
  ])

  if (exitCode !== 0) {
    exitCode = await run([
      '-i',
      'v1.mp4',
      '-i',
      'v2.mp4',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map',
      '[v]',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '23',
      '-movflags',
      '+faststart',
      'out.mp4',
    ])
  }

  if (exitCode !== 0) {
    throw new Error('Không ghép được 2 video — định dạng file không tương thích.')
  }

  const output = await ffmpeg.readFile('out.mp4')
  if (!(output instanceof Uint8Array) || output.byteLength === 0) {
    throw new Error('File video ghép rỗng.')
  }
  const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: 'video/mp4' })
}
