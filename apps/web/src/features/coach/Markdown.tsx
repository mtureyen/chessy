import { Fragment, type ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline } from './parseMarkdown'

/** The coach's answer, rendered from its Markdown as plain React elements. */
export function Markdown({ text }: { text: string }) {
  return <>{parseMarkdown(text).map(renderBlock)}</>
}

function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'paragraph':
      return <p key={key}>{renderInline(block.inline)}</p>
    case 'heading': {
      const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1]!
      return <Tag key={key}>{renderInline(block.inline)}</Tag>
    }
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul'
      return (
        <Tag key={key}>
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </Tag>
      )
    }
    case 'table':
      return (
        <div key={key} className="coach-table">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i}>{renderInline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

function renderInline(parts: Inline[]): ReactNode {
  return parts.map((part, i) => {
    switch (part.kind) {
      case 'text':
        return <Fragment key={i}>{part.text}</Fragment>
      case 'strong':
        return <strong key={i}>{renderInline(part.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(part.children)}</em>
      case 'code':
        return <code key={i}>{part.text}</code>
    }
  })
}
