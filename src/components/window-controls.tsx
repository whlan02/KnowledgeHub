import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Copy, Minus, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonClass =
  'flex h-12 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'

/** Minimise / maximise / close for the frameless window. */
export function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const win = getCurrentWindow()
    const sync = () => void win.isMaximized().then(setMaximized)
    sync()
    const unlisten = win.onResized(sync)
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  const win = getCurrentWindow()

  return (
    <div className="-mr-3 ml-1 flex items-center">
      <button type="button" className={buttonClass} aria-label="Minimize" onClick={() => void win.minimize()}>
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        className={buttonClass}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void win.toggleMaximize()}
      >
        {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        className={cn(buttonClass, 'hover:bg-red-600 hover:text-white')}
        aria-label="Close"
        onClick={() => void win.close()}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
