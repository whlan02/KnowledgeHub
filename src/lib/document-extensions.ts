import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Callout } from '@/lib/callout'
import { BackgroundColor, TextColor } from '@/lib/color-marks'
import { Toggle, ToggleContent, ToggleSummary } from '@/lib/toggle'
import { MarkdownUnderline } from '@/lib/underline'

/**
 * Everything that decides what a note's Markdown means: the nodes, marks and their Markdown
 * syntax. The app passes link and image variants that draw React views; tests use the plain ones.
 */
export function documentExtensions({
  link = Link,
  image = Image,
}: { link?: typeof Link; image?: typeof Image } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      link: false,
      underline: false,
      dropcursor: { color: '#2383e2', width: 2 },
    }),
    link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    image,
    Markdown,
    MarkdownUnderline,
    TextColor,
    BackgroundColor,
    Callout,
    Toggle,
    ToggleSummary,
    ToggleContent,
  ]
}
