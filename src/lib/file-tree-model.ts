import type { Note } from '@/lib/fs-notes'

export type TreeNode = {
  name: string
  path: string
  children: TreeNode[]
  note?: Note
}

/** Folders first, then notes, each sorted by name. */
function sortNode(node: TreeNode) {
  node.children.sort((a, b) => {
    const aDir = !a.note
    const bDir = !b.note
    if (aDir !== bDir) return aDir ? -1 : 1
    return a.name.localeCompare(b.name, 'zh')
  })
  node.children.forEach(sortNode)
}

/** The sidebar tree: every folder (even an empty one) and every note under it. */
export function buildTree(notes: Note[], folders: string[] = []): TreeNode {
  const root: TreeNode = { name: '', path: '', children: [] }

  const place = (path: string, note?: Note) => {
    const parts = path.split('/')
    let current = root
    let acc = ''
    parts.forEach((part, index) => {
      acc = acc ? `${acc}/${part}` : part
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: acc, children: [] }
        current.children.push(child)
      }
      if (note && index === parts.length - 1) child.note = note
      current = child
    })
  }

  for (const folder of folders) place(folder)
  for (const note of notes) place(note.path, note)
  sortNode(root)
  return root
}
