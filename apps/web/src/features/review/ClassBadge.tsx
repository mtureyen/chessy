import type { MoveClass } from '@chessy/analysis'
import { CLASS_STYLES } from './classes'

export function ClassBadge({ cls }: { cls: MoveClass }) {
  const style = CLASS_STYLES[cls]
  return (
    <span
      className="class-badge"
      style={{ background: style.color }}
      title={style.label}
      data-class={cls}
    >
      {style.glyph}
    </span>
  )
}
