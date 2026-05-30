import { useCallback, useEffect, useState } from 'react'
import {
  ensureDirectoryReadable,
  loadContentRootDirectoryHandle,
  pickContentRootDirectory,
} from '@/utils/localWorkspace'

export function useWorkspaceRoot() {
  const [workspaceRoot, setWorkspaceRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceLabel, setWorkspaceLabel] = useState('')
  const [pickingWorkspace, setPickingWorkspace] = useState(false)

  useEffect(() => {
    void loadContentRootDirectoryHandle().then(async (handle) => {
      if (!handle) return
      const ok = await ensureDirectoryReadable(handle)
      if (ok) {
        setWorkspaceRoot(handle)
        setWorkspaceLabel(handle.name)
      }
    })
  }, [])

  const pickWorkspace = useCallback(async () => {
    setPickingWorkspace(true)
    try {
      const handle = await pickContentRootDirectory()
      if (handle) {
        setWorkspaceRoot(handle)
        setWorkspaceLabel(handle.name)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Không chọn được thư mục.'
      window.alert(msg)
    } finally {
      setPickingWorkspace(false)
    }
  }, [])

  return { workspaceRoot, workspaceLabel, pickingWorkspace, pickWorkspace }
}
