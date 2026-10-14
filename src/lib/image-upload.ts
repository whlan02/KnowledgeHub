import { Extension } from '@tiptap/core'
import type { Node as ProseNode } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

/** A screenshot pasted from the clipboard arrives as just `image.png`. */
const GENERIC_NAME = /^image\.\w+$/i

export const isImageFile = (file: File) => file.type in MIME_EXTENSIONS

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Name for a pasted or dropped image: files keep their own name, but a generic one gets a
 * timestamp so it stays unique and recognisable.
 */
export function imageFileName(file: File, now = new Date()) {
  const extension = MIME_EXTENSIONS[file.type] ?? 'png'
  if (file.name && !GENERIC_NAME.test(file.name)) return file.name
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `image-${date}-${time}.${extension}`
}

/** A path as it is written in a Markdown image: each segment percent-encoded. */
export function markdownImageSrc(relativePath: string) {
  return relativePath.split('/').map(encodeURIComponent).join('/')
}

function imagesIn(files: FileList | null | undefined) {
  return [...(files ?? [])].filter(isImageFile)
}

/**
 * Put an image block at `pos` without splitting the paragraph or heading it lands in: it goes
 * after that block, or replaces it when the block is empty. Returns where the next block starts.
 */
export function insertImageBlock(view: EditorView, node: ProseNode, pos: number) {
  const $pos = view.state.doc.resolve(pos)
  let from = pos
  let to = pos
  if ($pos.parent.isTextblock) {
    const empty = $pos.parent.content.size === 0
    from = empty ? $pos.before() : $pos.after()
    to = $pos.after()
  }
  view.dispatch(view.state.tr.replaceWith(from, to, node))
  return from + node.nodeSize
}

/** Insert uploaded images at `position`, or at the selection when it is null. */
async function insertImages(
  view: EditorView,
  files: File[],
  position: number | null,
  upload: (file: File) => Promise<string | null>,
) {
  let at = position ?? view.state.selection.from
  for (const file of files) {
    const src = await upload(file)
    if (!src || view.isDestroyed) continue
    const node = view.state.schema.nodes.image.create({ src, alt: file.name.replace(/\.[^.]+$/, '') })
    at = insertImageBlock(view, node, Math.min(at, view.state.doc.content.size))
  }
}

/** Pasting or dropping image files saves them next to the note and inserts them as images. */
export const ImageUpload = Extension.create<{ upload: (file: File) => Promise<string | null> }>({
  name: 'imageUpload',
  addOptions() {
    return { upload: async () => null }
  },
  addProseMirrorPlugins() {
    const { upload } = this.options
    return [
      new Plugin({
        props: {
          handlePaste(view, event) {
            const images = imagesIn(event.clipboardData?.files)
            if (images.length === 0) return false
            event.preventDefault()
            void insertImages(view, images, null, upload)
            return true
          },
          handleDrop(view, event, _slice, moved) {
            if (moved) return false
            const images = imagesIn(event.dataTransfer?.files)
            if (images.length === 0) return false
            event.preventDefault()
            const dropAt = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
            void insertImages(view, images, dropAt, upload)
            return true
          },
        },
      }),
    ]
  },
})
