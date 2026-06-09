import { useCallback, useEffect, useRef, useState } from 'react'

type Point = { x: number; y: number }

export type MarqueeBox = {
  left: number
  top: number
  width: number
  height: number
}

function normalizeBox(start: Point, end: Point): MarqueeBox {
  const left = Math.min(start.x, end.x)
  const top = Math.min(start.y, end.y)
  return {
    left,
    top,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function boxToBounds(box: MarqueeBox) {
  return {
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  }
}

function rectsIntersect(a: DOMRect, b: ReturnType<typeof boxToBounds>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

const DRAG_THRESHOLD_PX = 6

export function useVideoShortMarqueeSelection(options: {
  enabled: boolean
  onToggleId: (id: string) => void
  onSelectIds: (ids: string[], mode: 'add' | 'replace') => void
}) {
  const { enabled, onToggleId, onSelectIds } = options
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map())
  const dragRef = useRef<{
    active: boolean
    startedOnCardId: string | null
    start: Point
    current: Point
    moved: boolean
  }>({
    active: false,
    startedOnCardId: null,
    start: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
    moved: false,
  })

  const [marquee, setMarquee] = useState<{ box: MarqueeBox; viewport: ReturnType<typeof boxToBounds> } | null>(null)

  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cardRefs.current.set(id, el)
    else cardRefs.current.delete(id)
  }, [])

  const toLocalBox = useCallback((start: Point, end: Point) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return normalizeBox(start, end)
    return normalizeBox(
      { x: start.x - rect.left, y: start.y - rect.top },
      { x: end.x - rect.left, y: end.y - rect.top },
    )
  }, [])

  const collectIdsInViewport = useCallback((viewport: ReturnType<typeof boxToBounds>) => {
    const ids: string[] = []
    cardRefs.current.forEach((el, id) => {
      if (rectsIntersect(el.getBoundingClientRect(), viewport)) ids.push(id)
    })
    return ids
  }, [])

  const finishDrag = useCallback(() => {
    const drag = dragRef.current
    if (!drag.active) return

    drag.active = false

    if (drag.moved) {
      const viewport = boxToBounds(normalizeBox(drag.start, drag.current))
      if (viewport.right - viewport.left >= DRAG_THRESHOLD_PX || viewport.bottom - viewport.top >= DRAG_THRESHOLD_PX) {
        const ids = collectIdsInViewport(viewport)
        if (ids.length > 0) {
          onSelectIds(ids, 'add')
        }
      }
    } else if (drag.startedOnCardId) {
      onToggleId(drag.startedOnCardId)
    }

    drag.startedOnCardId = null
    drag.moved = false
    setMarquee(null)
  }, [collectIdsInViewport, onSelectIds, onToggleId])

  useEffect(() => {
    if (!enabled) return

    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current
      if (!drag.active) return

      const next = { x: event.clientX, y: event.clientY }
      if (!drag.moved) {
        const dx = Math.abs(next.x - drag.start.x)
        const dy = Math.abs(next.y - drag.start.y)
        if (dx >= DRAG_THRESHOLD_PX || dy >= DRAG_THRESHOLD_PX) {
          drag.moved = true
        }
      }

      drag.current = next
      if (drag.moved) {
        const viewportBox = normalizeBox(drag.start, drag.current)
        setMarquee({
          box: toLocalBox(drag.start, drag.current),
          viewport: boxToBounds(viewportBox),
        })
      }
    }

    const onUp = () => finishDrag()

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [enabled, finishDrag, toLocalBox])

  const onContainerMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!enabled || event.button !== 0) return

      const target = event.target as HTMLElement
      if (target.closest('a, button, input, textarea, select, [data-no-marquee]')) return

      const cardEl = target.closest('[data-story-id]') as HTMLElement | null
      const startedOnCardId = cardEl?.dataset.videoShortId || null

      dragRef.current = {
        active: true,
        startedOnCardId,
        start: { x: event.clientX, y: event.clientY },
        current: { x: event.clientX, y: event.clientY },
        moved: false,
      }
      setMarquee(null)
      event.preventDefault()
    },
    [enabled],
  )

  return {
    containerRef,
    registerCard,
    marquee,
    onContainerMouseDown,
    isDragging: Boolean(marquee),
  }
}
