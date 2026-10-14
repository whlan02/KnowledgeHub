import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Type,
  type LucideIcon,
} from 'lucide-react'
import type { BlockTypeId } from '@/lib/block-actions'

export const BLOCK_ICONS: Record<BlockTypeId, LucideIcon> = {
  paragraph: Type,
  h1: Heading1,
  h2: Heading2,
  h3: Heading3,
  todo: ListTodo,
  bullet: List,
  ordered: ListOrdered,
  quote: Quote,
  code: Code,
  divider: Minus,
}

