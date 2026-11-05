import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './parseMarkdown'

const text = (t: string) => ({ kind: 'text', text: t })

describe('parseInline', () => {
  it('reads bold, italic and code, and leaves the rest as text', () => {
    expect(parseInline('Play **Nf3** and *then* `O-O`.')).toEqual([
      text('Play '),
      { kind: 'strong', children: [text('Nf3')] },
      text(' and '),
      { kind: 'em', children: [text('then')] },
      text(' '),
      { kind: 'code', text: 'O-O' },
      text('.'),
    ])
  })

  it('keeps move notation and lone stars as text', () => {
    expect(parseInline('37...Qc5 and 2 * 3 = 6')).toEqual([text('37...Qc5 and 2 * 3 = 6')])
    expect(parseInline('a <b>tag</b>')).toEqual([text('a <b>tag</b>')])
  })
})

describe('parseMarkdown', () => {
  it('splits paragraphs, headings and lists', () => {
    const blocks = parseMarkdown(
      '## The moment\nWhite pins\nthe queen.\n\n1. Kc6 guards d6\n2. Qc5 loses\n- one\n* two',
    )
    expect(blocks).toEqual([
      { kind: 'heading', level: 2, inline: [text('The moment')] },
      { kind: 'paragraph', inline: [text('White pins the queen.')] },
      { kind: 'list', ordered: true, items: [[text('Kc6 guards d6')], [text('Qc5 loses')]] },
      { kind: 'list', ordered: false, items: [[text('one')], [text('two')]] },
    ])
  })

  it('reads tables', () => {
    const blocks = parseMarkdown(
      '| Opening | Score |\n|---|---:|\n| Caro-Kann | **22%** |\n\nAfter.',
    )
    expect(blocks).toEqual([
      {
        kind: 'table',
        header: [[text('Opening')], [text('Score')]],
        rows: [[[text('Caro-Kann')], [{ kind: 'strong', children: [text('22%')] }]]],
      },
      { kind: 'paragraph', inline: [text('After.')] },
    ])
  })
})
