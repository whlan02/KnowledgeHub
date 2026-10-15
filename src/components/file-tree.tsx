import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { KIND_COLOR } from '@/lib/git-markers'
import { buildTree, type TreeNode } from '@/lib/file-tree-model'
import { isInside, nameOf, parentOf } from '@/lib/path-ops'
import { cn, encodeNotePath } from '@/lib/utils'
import { useGit } from '@/components/git-provider'
import { MenuItem, MenuPanel } from '@/components/menu-panel'
import { useNotes } from '@/components/notes-provider'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFileActions } from '@/components/use-file-actions'

const DRAG_TYPE = 'text/x-kh-path'
const NOTE_EXTENSION = /\.md$/i

type MenuState = { x: number; y: number; node: TreeNode | null }

/** Name shown while renaming: the file name, without `.md` for notes. */
function editableName(node: TreeNode) {
  return node.note ? nameOf(node.path).replace(NOTE_EXTENSION, '') : node.name
}

function RenameInput({
  initial,
  depth,
  onCommit,
  onCancel,
}: {
  initial: string
  depth: number
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const finished = useRef(false)

  const finish = (commit: boolean) => {
    if (finished.current) return
    finished.current = true
    const name = value.trim()
    if (commit && name && name !== initial) onCommit(name)
    else onCancel()
  }

  return (
    <input
      autoFocus
      value={value}
      className="mx-2 w-[calc(100%-1rem)] rounded-md border bg-background px-2 py-1 text-[13px] outline-none"
      style={{ marginLeft: 8 + depth * 12 }}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
      }}
    />
  )
}

type TreeContext = {
  expanded: Set<string>
  toggle: (path: string) => void
  renaming: string | null
  startRename: (path: string | null) => void
  rename: (path: string, name: string) => void
  openMenu: (event: React.MouseEvent, node: TreeNode | null) => void
  dragPath: React.MutableRefObject<string | null>
  dropTarget: string | null
  setDropTarget: (path: string | null) => void
  drop: (targetDir: string) => void
}

/** A dragged entry can go into `folder` unless it is already there or would end up inside itself. */
function canDrop(dragged: string | null, folder: string) {
  return dragged !== null && parentOf(dragged) !== folder && !isInside(folder, dragged)
}

/** Small dot for a note or folder with uncommitted changes (a folder when anything inside changed). */
function ChangeDot({ path }: { path: string }) {
  const { t } = useTranslation()
  const kind = useGit().markers.get(path)
  if (!kind) return null
  return (
    <span
      title={t(`gitKind_${kind}`)}
      className={cn('ml-auto size-1.5 shrink-0 rounded-full bg-current', KIND_COLOR[kind])}
    />
  )
}

function TreeItem({ node, depth, ctx }: { node: TreeNode; depth: number; ctx: TreeContext }) {
  const isDir = !node.note
  const open = ctx.expanded.has(node.path)
  const isRenaming = ctx.renaming === node.path
  const isDropTarget = isDir && ctx.dropTarget === node.path

  const dragProps = {
    draggable: !isRenaming,
    onDragStart: (event: DragEvent) => {
      ctx.dragPath.current = node.path
      event.dataTransfer.setData(DRAG_TYPE, node.path)
      event.dataTransfer.effectAllowed = 'move'
    },
    onDragEnd: () => {
      ctx.dragPath.current = null
      ctx.setDropTarget(null)
    },
  }

  if (isRenaming) {
    return (
      <RenameInput
        initial={editableName(node)}
        depth={depth}
        onCommit={(name) => ctx.rename(node.path, name)}
        onCancel={() => ctx.startRename(null)}
      />
    )
  }

  if (isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => ctx.toggle(node.path)}
          onContextMenu={(event) => ctx.openMenu(event, node)}
          onDragOver={(event) => {
            if (!canDrop(ctx.dragPath.current, node.path)) return
            event.preventDefault()
            event.stopPropagation()
            ctx.setDropTarget(node.path)
          }}
          onDrop={(event) => {
            event.preventDefault()
            event.stopPropagation()
            ctx.drop(node.path)
          }}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            isDropTarget && 'bg-accent text-accent-foreground ring-1 ring-primary/40',
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
          {...dragProps}
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <Folder className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
          <ChangeDot path={node.path} />
        </button>
        {open &&
          node.children.map((child) => <TreeItem key={child.path} node={child} depth={depth + 1} ctx={ctx} />)}
      </div>
    )
  }

  return (
    <NavLink
      to={`/n/${encodeNotePath(node.note!.path)}`}
      onContextMenu={(event) => ctx.openMenu(event, node)}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent font-medium text-accent-foreground',
        )
      }
      style={{ paddingLeft: 8 + depth * 12 }}
      title={node.note!.path}
      {...dragProps}
    >
      <FileText className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{node.note!.title}</span>
      <ChangeDot path={node.path} />
    </NavLink>
  )
}

/** `renameRequest`: a path (like a folder just created from the header) to put into rename mode. */
export function FileTree({ renameRequest = null }: { renameRequest?: string | null }) {
  const { t } = useTranslation()
  const { notes, folders } = useNotes()
  const actions = useFileActions()
  const tree = useMemo(() => buildTree(notes, folders), [notes, folders])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragPath = useRef<string | null>(null)

  useEffect(() => {
    if (renameRequest) setRenaming(renameRequest)
  }, [renameRequest])

  const expand = (path: string) => setExpanded((prev) => new Set(prev).add(path))

  // A new note inside a closed folder must be visible: open the folders on the way to it.
  useEffect(() => {
    if (!actions.openPath) return
    const parts = actions.openPath.split('/').slice(0, -1)
    const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join('/'))
    setExpanded((prev) => (ancestors.every((a) => prev.has(a)) ? prev : new Set([...prev, ...ancestors])))
  }, [actions.openPath])

  const ctx: TreeContext = {
    expanded,
    toggle: (path) =>
      setExpanded((prev) => {
        const next = new Set(prev)
        if (!next.delete(path)) next.add(path)
        return next
      }),
    renaming,
    startRename: setRenaming,
    rename: (path, name) => {
      setRenaming(null)
      void actions.rename(path, name)
    },
    openMenu: (event, node) => {
      event.preventDefault()
      event.stopPropagation()
      setMenu({ x: event.clientX, y: event.clientY, node })
    },
    dragPath,
    dropTarget,
    setDropTarget,
    drop: (targetDir) => {
      const dragged = dragPath.current
      dragPath.current = null
      setDropTarget(null)
      if (!dragged || !canDrop(dragged, targetDir)) return
      if (targetDir) expand(targetDir)
      void actions.move(dragged, targetDir)
    },
  }

  /** Where "new note / new folder" from a menu on `node` puts things. */
  const targetDir = (node: TreeNode | null) => (node ? (node.note ? parentOf(node.path) : node.path) : '')

  const createHere = async (node: TreeNode | null, kind: 'note' | 'folder') => {
    const dir = targetDir(node)
    if (dir) expand(dir)
    if (kind === 'note') {
      await actions.newNote(dir)
    } else {
      const path = await actions.newFolder(dir)
      if (path) {
        expand(dir)
        setRenaming(path)
      }
    }
  }

  const rootDropProps = {
    onDragOver: (event: DragEvent) => {
      if (!canDrop(dragPath.current, '')) return
      event.preventDefault()
      setDropTarget('')
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      ctx.drop('')
    },
  }

  return (
    <>
      <ScrollArea
        className="h-full"
        onContextMenu={(event: React.MouseEvent) => ctx.openMenu(event, null)}
        {...rootDropProps}
      >
        <div className={cn('min-h-full p-2 pr-3', dropTarget === '' && 'bg-accent/40')}>
          {notes.length === 0 && folders.length === 0 && (
            <p className="px-1 py-2 text-sm text-muted-foreground">{t('emptyFolder')}</p>
          )}
          {tree.children.map((child) => (
            <TreeItem key={child.path} node={child} depth={0} ctx={ctx} />
          ))}
        </div>
      </ScrollArea>
      {menu && (
        <MenuPanel x={menu.x} y={menu.y} onDismiss={() => setMenu(null)}>
          {(!menu.node || !menu.node.note) && (
            <>
              <MenuItem
                icon={FilePlus}
                label={t('fileNewNote')}
                onSelect={() => {
                  setMenu(null)
                  void createHere(menu.node, 'note')
                }}
              />
              <MenuItem
                icon={FolderPlus}
                label={t('fileNewFolder')}
                onSelect={() => {
                  setMenu(null)
                  void createHere(menu.node, 'folder')
                }}
              />
            </>
          )}
          {menu.node && (
            <>
              <MenuItem
                icon={Pencil}
                label={t('fileRename')}
                onSelect={() => {
                  const path = menu.node!.path
                  setMenu(null)
                  setRenaming(path)
                }}
              />
              <MenuItem
                icon={Trash2}
                label={t('fileDelete')}
                destructive
                onSelect={() => {
                  const node = menu.node!
                  setMenu(null)
                  void actions.remove(node.path, !node.note)
                }}
              />
            </>
          )}
        </MenuPanel>
      )}
    </>
  )
}
