import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ChangeMarks } from '@/lib/change-marks'

type MarksState = { marks: ChangeMarks | null }

const changeMarksKey = new PluginKey<MarksState>('changeMarks')

/** Show these marks (or none) in the editor; they follow the document until the next call. */
export function setChangeMarks(editor: Editor, marks: ChangeMarks | null) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(changeMarksKey, { marks }))
}

function deletionMarker() {
  const marker = document.createElement('span')
  marker.className = 'kh-change-deleted'
  marker.contentEditable = 'false'
  return marker
}

function decorationsFor(doc: ProseMirrorNode, { statuses, deletions }: ChangeMarks) {
  // Marks computed for an older document are wrong for this one; wait for the next comparison.
  if (statuses.length !== doc.childCount) return DecorationSet.empty
  const decorations: Decoration[] = []
  doc.forEach((node, offset, index) => {
    if (deletions.includes(index)) decorations.push(Decoration.widget(offset, deletionMarker, { side: -1, key: `deleted-${index}` }))
    if (statuses[index] !== 'same') {
      decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: `kh-change-${statuses[index]}` }))
    }
  })
  if (deletions.includes(doc.childCount)) {
    decorations.push(Decoration.widget(doc.content.size, deletionMarker, { side: 1, key: 'deleted-end' }))
  }
  return DecorationSet.create(doc, decorations)
}

/** Marks top-level blocks that differ from the committed note: added, modified, deleted-before. */
export const ChangeMarksExtension = Extension.create({
  name: 'changeMarks',
  addProseMirrorPlugins() {
    return [
      new Plugin<MarksState>({
        key: changeMarksKey,
        state: {
          init: () => ({ marks: null }),
          apply: (tr, value) => tr.getMeta(changeMarksKey) ?? value,
        },
        props: {
          decorations(state) {
            const marks = changeMarksKey.getState(state)?.marks
            return marks ? decorationsFor(state.doc, marks) : DecorationSet.empty
          },
        },
      }),
    ]
  },
})
