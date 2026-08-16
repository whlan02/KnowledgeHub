import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react'
import type { Note } from 'virtual:notes'
import { cn, encodeNotePath } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'

type TreeNode = {
  name: string
  path: string
  children: TreeNode[]
  note?: Note
}

function buildTree(notes: Note[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] }

  for (const note of notes) {
    const parts = note.path.split('/')
    let current = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      acc = acc ? `${acc}/${part}` : part
      const isFile = i === parts.length - 1
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: acc, children: [] }
        current.children.push(child)
      }
      if (isFile) child.note = note
      current = child
    }
  }

  const sortNode = (node: TreeNode) => {
    node.children.sort((a, b) => {
      const aDir = !a.note
      const bDir = !b.note
      if (aDir !== bDir) return aDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh')
    })
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}

function TreeItem({
  node,
  depth,
}: {
  node: TreeNode
  depth: number
}) {
  const isDir = !node.note
  const [open, setOpen] = useState(false)

  if (isDir) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          {open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
          <Folder className="size-3.5 shrink-0 opacity-70" />
          <span className="truncate">{node.name}</span>
        </button>
        {open &&
          node.children.map((child) => <TreeItem key={child.path} node={child} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <NavLink
      to={`/n/${encodeNotePath(node.note!.path)}`}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          isActive && 'bg-accent font-medium text-accent-foreground',
        )
      }
      style={{ paddingLeft: 8 + depth * 12 }}
      title={node.note!.title}
    >
      <FileText className="size-3.5 shrink-0 opacity-70" />
      <span className="truncate">{node.note!.title}</span>
    </NavLink>
  )
}

export function FileTree({ notes }: { notes: Note[] }) {
  const { t } = useTranslation()
  const tree = useMemo(() => buildTree(notes), [notes])

  if (notes.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">{t('emptyFolder')}</p>
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 pr-3">
        {tree.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={0} />
        ))}
      </div>
    </ScrollArea>
  )
}
