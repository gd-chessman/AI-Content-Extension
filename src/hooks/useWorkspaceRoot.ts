import { useCallback, useEffect, useState } from 'react'
import {
  getWorkspaceRootNameFromStorage,
  loadContentRootDirectoryHandle,
  persistContentRootDirectoryHandle,
  queryDirectoryReadable,
  resolveContentRootDirectoryAccess,
} from '@/utils/localWorkspace'

export function useWorkspaceRoot() {
  const [workspaceRoot, setWorkspaceRoot] = useState<FileSystemDirectoryHandle | null>(null)
  const [workspaceLabel, setWorkspaceLabel] = useState('')
  const [hasStoredWorkspace, setHasStoredWorkspace] = useState(false)
  const [pickingWorkspace, setPickingWorkspace] = useState(false)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const storedName = getWorkspaceRootNameFromStorage()
        const handle = await loadContentRootDirectoryHandle()
        const label = handle?.name || storedName || ''
        if (label) setWorkspaceLabel(label)
        setHasStoredWorkspace(Boolean(handle || storedName))

        if (handle) {
          if (!storedName) await persistContentRootDirectoryHandle(handle)
          if (await queryDirectoryReadable(handle)) {
            setWorkspaceRoot(handle)
          }
        }
      } finally {
        setBootstrapping(false)
      }
    })()
  }, [])

  const applyWorkspaceHandle = useCallback((handle: FileSystemDirectoryHandle) => {
    setWorkspaceRoot(handle)
    setWorkspaceLabel(handle.name)
    setHasStoredWorkspace(true)
  }, [])

  const accessStoredWorkspace = useCallback(async (allowPicker: boolean) => {
    let handle = await resolveContentRootDirectoryAccess({ allowPicker: false, allowRequest: true })
    if (!handle && allowPicker) {
      handle = await resolveContentRootDirectoryAccess({ allowPicker: true, allowRequest: true })
    }
    return handle
  }, [])

  const restoreWorkspace = useCallback(async () => {
    setPickingWorkspace(true)
    try {
      const handle = await accessStoredWorkspace(true)
      if (handle) applyWorkspaceHandle(handle)
      return handle
    } finally {
      setPickingWorkspace(false)
    }
  }, [accessStoredWorkspace, applyWorkspaceHandle])

  const pickWorkspace = useCallback(async () => {
    setPickingWorkspace(true)
    try {
      const handle = hasStoredWorkspace
        ? await accessStoredWorkspace(true)
        : await resolveContentRootDirectoryAccess({ allowPicker: true, allowRequest: true })
      if (handle) applyWorkspaceHandle(handle)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Không chọn được thư mục.'
      window.alert(msg)
    } finally {
      setPickingWorkspace(false)
    }
  }, [accessStoredWorkspace, applyWorkspaceHandle, hasStoredWorkspace])

  const needsPermissionRestore = hasStoredWorkspace && !workspaceRoot

  return {
    workspaceRoot,
    workspaceLabel,
    hasStoredWorkspace,
    needsPermissionRestore,
    bootstrapping,
    pickingWorkspace,
    pickWorkspace,
    restoreWorkspace,
  }
}
