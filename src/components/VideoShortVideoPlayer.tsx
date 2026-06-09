import { useEffect, useState } from 'react'
import { FiAlertCircle, FiFolder, FiLoader } from 'react-icons/fi'
import {
  isHttpVideoEntry,
  isLocalVideoEntry,
  parseLocalStoragePath,
  readFileFromWorkspace,
} from '@/utils/localWorkspace'

type VideoShortVideoPlayerProps = {
  entry: string
  workspaceRoot: FileSystemDirectoryHandle | null
  workspaceLabel?: string
  needsPermissionRestore?: boolean
  onPickWorkspace: () => void
  pickingWorkspace?: boolean
}

export default function VideoShortVideoPlayer({
  entry,
  workspaceRoot,
  workspaceLabel = '',
  needsPermissionRestore = false,
  onPickWorkspace,
  pickingWorkspace = false,
}: VideoShortVideoPlayerProps) {
  const [objectUrl, setObjectUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const localPath = parseLocalStoragePath(entry)
  const isLocal = isLocalVideoEntry(entry)
  const isHttp = isHttpVideoEntry(entry)

  useEffect(() => {
    if (!isLocal || !localPath || !workspaceRoot) {
      setObjectUrl('')
      setError('')
      return undefined
    }

    let revoked = false
    let blobUrl = ''

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const file = await readFileFromWorkspace(workspaceRoot, localPath)
        if (!file) {
          throw new Error('Không tìm thấy file hoặc chưa có quyền đọc thư mục.')
        }
        if (revoked) return
        blobUrl = URL.createObjectURL(file)
        setObjectUrl(blobUrl)
      } catch (e) {
        if (!revoked) {
          setError(e instanceof Error ? e.message : 'Không đọc được video trên máy.')
          setObjectUrl('')
        }
      } finally {
        if (!revoked) setLoading(false)
      }
    }

    void load()

    return () => {
      revoked = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [isLocal, localPath, workspaceRoot])

  if (isHttp) {
    return (
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        <video src={entry} controls className="aspect-video w-full bg-black" preload="metadata">
          Trình duyệt không hỗ trợ phát video.
        </video>
      </div>
    )
  }

  if (!isLocal || !localPath) {
    return (
      <p className="text-xs text-slate-500">Định dạng video không hỗ trợ phát trực tiếp.</p>
    )
  }

  if (!workspaceRoot) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
        <p className="text-xs text-amber-100">
          {needsPermissionRestore
            ? `Video lưu trên máy — sau khi reload trang cần bấm khôi phục quyền thư mục${workspaceLabel ? ` (${workspaceLabel})` : ''} (không cần chọn lại đường dẫn).`
            : 'Video lưu trên máy — chọn thư mục làm việc (cùng thư mục extension dùng khi lưu Grok) để xem.'}
        </p>
        <button
          type="button"
          onClick={onPickWorkspace}
          disabled={pickingWorkspace}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/15 px-3 py-1.5 text-xs text-amber-50 hover:bg-amber-500/25 disabled:opacity-50"
        >
          <FiFolder className="h-3.5 w-3.5" />
          {pickingWorkspace
            ? 'Đang khôi phục…'
            : needsPermissionRestore
              ? 'Khôi phục quyền xem video'
              : 'Chọn thư mục làm việc'}
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-white/10 bg-black/40">
        <FiLoader className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3">
        <p className="flex items-start gap-2 text-xs text-rose-100">
          <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
        <p className="mt-2 font-mono text-[10px] text-rose-200/80">{localPath}</p>
        <button
          type="button"
          onClick={onPickWorkspace}
          disabled={pickingWorkspace}
          className="mt-2 text-xs text-rose-200 underline hover:text-white"
        >
          Chọn lại thư mục làm việc
        </button>
      </div>
    )
  }

  if (!objectUrl) return null

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
        <video src={objectUrl} controls className="aspect-video w-full bg-black" preload="metadata">
          Trình duyệt không hỗ trợ phát video.
        </video>
      </div>
      <p className="font-mono text-[10px] text-teal-400/80">{localPath}</p>
    </div>
  )
}
