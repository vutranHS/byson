import { useState, useRef, useLayoutEffect } from 'react'

/**
 * useSmartMenu - A hook that provides a context menu state with auto-flip
 * behavior when the menu would overflow the viewport bottom or right edge.
 *
 * Usage:
 *   const { menu, menuRef, openMenu, closeMenu } = useSmartMenu()
 *   // open: openMenu({ x: e.clientX, y: e.clientY, ...payload })
 *   // render: <div ref={menuRef} style={menu.style}>...</div>
 */
export function useSmartMenu() {
  const [menu, setMenu] = useState(null)
  const [adjustedPos, setAdjustedPos] = useState(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!menu) { setAdjustedPos(null); return }
    if (!menuRef.current) { setAdjustedPos({ x: menu.x, y: menu.y }); return }

    const rect = menuRef.current.getBoundingClientRect()
    const viewH = window.innerHeight
    const viewW = window.innerWidth

    let x = menu.x
    let y = menu.y

    if (y + rect.height > viewH - 8) y = Math.max(8, viewH - rect.height - 8)
    if (x + rect.width > viewW - 8) x = Math.max(8, viewW - rect.width - 8)

    setAdjustedPos({ x, y })
  }, [menu])

  const openMenu = (payload) => setMenu(payload)
  const closeMenu = () => setMenu(null)

  const style = menu
    ? { top: adjustedPos ? adjustedPos.y : menu.y, left: adjustedPos ? adjustedPos.x : menu.x }
    : {}

  return { menu, menuRef, openMenu, closeMenu, style }
}
