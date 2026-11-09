import type { MoveClass } from '@pawnia/analysis'
import { classIconSvg } from './classIcons'
import { CLASS_STYLES } from './classes'

export function ClassBadge({ cls }: { cls: MoveClass }) {
  const label = CLASS_STYLES[cls].label
  return (
    <svg
      className="class-badge"
      viewBox="-20 -20 40 40"
      role="img"
      aria-label={label}
      data-class={cls}
      // Our own static markup (classIcons.ts), shared with the board's badge.
      dangerouslySetInnerHTML={{ __html: `<title>${label}</title>${classIconSvg(cls)}` }}
    />
  )
}
