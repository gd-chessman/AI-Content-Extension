import { useCallback, useEffect, useState } from 'react'
import {
  getWorkspaceRootNameFromStorage,
  loadContentRootDirectoryHandle,
  persistContentRootDirectoryHandle,
  resolveContentRootDirectoryAccess,
} from '@/utils/localWorkspace'

export function useWorkspaceRoot() {
  const [workspaceRoot, setWorkspaceRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceLabel, setWorkspaceLabel] = useState('')
  const [pickingWorkspace, setPickingWorkspace] = useState(false)

  useEffect(() => {
    void (async () => {
      const storedName = getWorkspaceRootNameFromStorage()
      const handle = await loadContentRootDirectoryHandle()
      if (handle?.name) {
        setWorkspaceLabel(handle.name)
        if (!storedName) await persistContentRootDirectoryHandle(handle)
      } else if (storedName) {
        setWorkspaceLabel(storedName)
      }
    })()
  }, [])

  const pickWorkspace = useCallback(async () => {
    setPickingWorkspace(true)
    try {
      const handle = await resolveContentRootDirectoryAccess({ allowPicker: true, allowRequest: true })
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
