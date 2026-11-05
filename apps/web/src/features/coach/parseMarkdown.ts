/**
 * The bit of Markdown the coach writes: paragraphs, headings, lists, tables, and **bold**,
 * *italic* and `code` inside them. Parsed into plain data, so the answer is rendered as React
 * elements and never as HTML from the model.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong' | 'em'; children: Inline[] }
  | { kind: 'code'; text: string }

export type Block =
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  const endParagraph = () => {
    if (paragraph.length > 0)
      blocks.push({ kind: 'paragraph', inline: parseInline(paragraph.join(' ')) })
    paragraph = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.trim() === '') {
      endParagraph()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      endParagraph()
      const level = Math.min(heading[1]!.length, 3) as 1 | 2 | 3
      blocks.push({ kind: 'heading', level, inline: parseInline(heading[2]!) })
      continue
    }
    if (line.includes('|') && TABLE_RULE.test(lines[i + 1] ?? '')) {
      endParagraph()
      const header = cells(line)
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(cells(lines[i]!))
        i++
      }
      i--
      blocks.push({ kind: 'table', header, rows })
      continue
    }
    const item = BULLET.exec(line) ?? NUMBERED.exec(line)
    if (item) {
      endParagraph()
      const ordered = !BULLET.test(line)
      const last = blocks.at(-1)
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(parseInline(item[1]!))
      else blocks.push({ kind: 'list', ordered, items: [parseInline(item[1]!)] })
      continue
    }
    paragraph.push(line.trim())
  }
  endParagraph()
  return blocks
}

function cells(line: string): Inline[][] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => parseInline(cell.trim()))
}

/** Bold, italic and code spans; anything unmatched stays text. */
export function parseInline(text: string): Inline[] {
  const result: Inline[] = []
  let rest = text
  const pattern = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)(?<!\s)\3(?![\w*])|`([^`]+)`/
  for (;;) {
    const match = pattern.exec(rest)
    if (!match) break
    if (match.index > 0) result.push({ kind: 'text', text: rest.slice(0, match.index) })
    if (match[2] !== undefined) result.push({ kind: 'strong', children: parseInline(match[2]) })
    else if (match[4] !== undefined) result.push({ kind: 'em', children: parseInline(match[4]) })
    else result.push({ kind: 'code', text: match[5]! })
    rest = rest.slice(match.index + match[0].length)
  }
  if (rest) result.push({ kind: 'text', text: rest })
  return result
}
