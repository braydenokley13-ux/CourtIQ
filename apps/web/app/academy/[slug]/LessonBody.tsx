/**
 * Tiny markdown renderer. Lesson bodies are authored by us in the seed files
 * (no user input), so this is safe-by-construction. Supports the subset we
 * actually use: h2/h3, paragraphs, ul/ol, blockquote, **bold**, *italic*, `code`.
 */

type Block =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim().length === 0) {
      i += 1
      continue
    }

    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() })
      i += 1
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() })
      i += 1
      continue
    }
    if (line.startsWith('> ')) {
      const buf: string[] = []
      while (i < lines.length && (lines[i] ?? '').startsWith('> ')) {
        buf.push((lines[i] ?? '').slice(2).trim())
        i += 1
      }
      blocks.push({ type: 'quote', text: buf.join(' ') })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*]\s+/, '').trim())
        i += 1
      }
      blocks.push({ type: 'ul', items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, '').trim())
        i += 1
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // Paragraph: consume until blank line or block-starter
    const buf: string[] = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (
        next.trim().length === 0 ||
        next.startsWith('## ') ||
        next.startsWith('### ') ||
        next.startsWith('> ') ||
        /^\s*[-*]\s+/.test(next) ||
        /^\s*\d+\.\s+/.test(next)
      ) {
        break
      }
      buf.push(next)
      i += 1
    }
    blocks.push({ type: 'p', text: buf.join(' ') })
  }

  return blocks
}

function renderInline(text: string): React.ReactNode[] {
  // Order matters: code first (won't be re-parsed), then bold, then italic.
  const tokens: React.ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push(text.slice(lastIndex, match.index))
    const tok = match[0]
    if (tok.startsWith('`')) {
      tokens.push(
        <code key={key++} className="rounded bg-bg-2 px-1 py-0.5 text-[0.85em] text-text">
          {tok.slice(1, -1)}
        </code>,
      )
    } else if (tok.startsWith('**')) {
      tokens.push(
        <strong key={key++} className="font-semibold text-text">
          {tok.slice(2, -2)}
        </strong>,
      )
    } else {
      tokens.push(
        <em key={key++} className="italic text-text">
          {tok.slice(1, -1)}
        </em>,
      )
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex))
  return tokens
}

export function LessonBody({ markdown }: { markdown: string }) {
  const blocks = parse(markdown)
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-text-dim">
      {blocks.map((b, idx) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2 key={idx} className="mt-2 font-display text-[20px] font-bold text-text">
                {renderInline(b.text)}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={idx} className="mt-1 font-display text-[16px] font-bold text-text">
                {renderInline(b.text)}
              </h3>
            )
          case 'quote':
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-brand bg-bg-1 px-4 py-3 text-text italic"
              >
                {renderInline(b.text)}
              </blockquote>
            )
          case 'ul':
            return (
              <ul key={idx} className="ml-5 list-disc space-y-1">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            )
          case 'ol':
            return (
              <ol key={idx} className="ml-5 list-decimal space-y-1">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            )
          case 'p':
          default:
            return <p key={idx}>{renderInline(b.text)}</p>
        }
      })}
    </div>
  )
}
