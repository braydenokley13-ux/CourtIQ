/**
 * Lesson markdown renderer.
 *
 * Lesson bodies are authored by us in seed JSON (no user input), so this is
 * safe-by-construction.
 *
 * Supports:
 *   - h2/h3, paragraphs, ul/ol, blockquote
 *   - inline **bold**, *italic*, `code`
 *   - fenced "interactive" blocks the lesson player styles distinctly:
 *       ```tip       quick tip / coach cue
 *       ```mistake   common mistake / "don't do this"
 *       ```takeaway  the headline takeaway
 *       ```reveal    "tap to reveal" Q/A flashcard (Q: / A:)
 *       ```quiz      one-question quiz (see parseQuiz)
 *       ```scenario  a short story prompt
 *       ```coach     coach quote
 *
 * If a fenced language is unknown we render it as a plain code block, so the
 * old `body_md` corpus keeps working unchanged.
 */
'use client'

import { useState } from 'react'

export type LessonBlock =
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'tip'; text: string }
  | { type: 'mistake'; text: string }
  | { type: 'takeaway'; text: string }
  | { type: 'coach'; text: string }
  | { type: 'scenario'; text: string }
  | { type: 'reveal'; question: string; answer: string }
  | {
      type: 'quiz'
      question: string
      options: { label: string; correct: boolean }[]
      explanation: string
    }
  | { type: 'code'; lang: string; text: string }

const FENCE_RE = /^```(\w+)?\s*$/

export function parseLessonBlocks(md: string): LessonBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const blocks: LessonBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim().length === 0) {
      i += 1
      continue
    }

    // Fenced block?
    const fence = line.match(FENCE_RE)
    if (fence) {
      const lang = (fence[1] ?? '').toLowerCase()
      const buf: string[] = []
      i += 1
      while (i < lines.length && !FENCE_RE.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1 // consume closing fence
      const inner = buf.join('\n').trim()
      const block = makeFencedBlock(lang, inner)
      if (block) blocks.push(block)
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

    // Paragraph
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
        /^\s*\d+\.\s+/.test(next) ||
        FENCE_RE.test(next)
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

function makeFencedBlock(lang: string, text: string): LessonBlock | null {
  switch (lang) {
    case 'tip':
      return { type: 'tip', text }
    case 'mistake':
      return { type: 'mistake', text }
    case 'takeaway':
      return { type: 'takeaway', text }
    case 'coach':
      return { type: 'coach', text }
    case 'scenario':
      return { type: 'scenario', text }
    case 'reveal':
      return parseReveal(text)
    case 'quiz':
      return parseQuiz(text)
    case '':
      return text.length > 0 ? { type: 'code', lang: '', text } : null
    default:
      return { type: 'code', lang, text }
  }
}

function parseReveal(text: string): LessonBlock {
  // Format:
  //   Q: question text (one or more lines)
  //   A: answer text (one or more lines)
  const qMatch = text.match(/(?:^|\n)Q:\s*([\s\S]*?)(?=\nA:|$)/)
  const aMatch = text.match(/(?:^|\n)A:\s*([\s\S]*)$/)
  return {
    type: 'reveal',
    question: (qMatch?.[1] ?? text).trim(),
    answer: (aMatch?.[1] ?? '').trim(),
  }
}

function parseQuiz(text: string): LessonBlock {
  // Format:
  //   Q: question
  //   - option ✓     (correct, marked with ✓ or [x] at the end)
  //   - option       (wrong)
  //   Why: explanation
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let question = ''
  const options: { label: string; correct: boolean }[] = []
  let explanation = ''

  for (const line of lines) {
    if (/^Q:/i.test(line)) {
      question = line.replace(/^Q:\s*/i, '').trim()
    } else if (/^-\s+/.test(line)) {
      const raw = line.replace(/^-\s+/, '').trim()
      const correct = /[✓]\s*$/.test(raw) || /\[x\]\s*$/i.test(raw)
      const label = raw.replace(/[✓]\s*$/, '').replace(/\[x\]\s*$/i, '').trim()
      options.push({ label, correct })
    } else if (/^Why:/i.test(line)) {
      explanation = line.replace(/^Why:\s*/i, '').trim()
    } else if (explanation) {
      explanation += ' ' + line
    } else if (question) {
      question += ' ' + line
    }
  }

  if (options.length === 0) {
    options.push({ label: 'Got it', correct: true })
  }

  return { type: 'quiz', question, options, explanation }
}

function renderInline(text: string): React.ReactNode[] {
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

export function RenderInline({ text }: { text: string }) {
  return <>{renderInline(text)}</>
}

function RevealCard({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-iq/30 bg-iq/5 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-iq">
        Tap to reveal
      </div>
      <p className="mt-2 font-display text-[15px] font-semibold text-text">
        {renderInline(question)}
      </p>
      {open ? (
        <p className="mt-3 text-sm text-text-dim">{renderInline(answer)}</p>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl border border-iq/40 bg-iq/10 py-2.5 text-sm font-semibold text-iq"
        >
          Show answer
        </button>
      )}
    </div>
  )
}

function QuizCard({
  question,
  options,
  explanation,
  onAnswer,
}: {
  question: string
  options: { label: string; correct: boolean }[]
  explanation: string
  onAnswer?: (correct: boolean) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const isCorrect = picked != null && options[picked]?.correct === true

  return (
    <div className="rounded-2xl border border-hairline-2 bg-bg-1 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">
        Quick quiz
      </div>
      <p className="mt-2 font-display text-[15px] font-semibold text-text">
        {renderInline(question)}
      </p>
      <div className="mt-3 space-y-2">
        {options.map((opt, idx) => {
          const showResult = picked != null
          const wasPicked = picked === idx
          const showCorrect = showResult && opt.correct
          const showWrong = showResult && wasPicked && !opt.correct
          return (
            <button
              key={idx}
              disabled={picked != null}
              onClick={() => {
                setPicked(idx)
                onAnswer?.(opt.correct)
              }}
              className="w-full rounded-xl border bg-bg-2 px-3 py-2.5 text-left text-sm transition-colors"
              style={{
                borderColor: showCorrect
                  ? 'var(--brand)'
                  : showWrong
                    ? 'var(--heat)'
                    : 'var(--hairline-2)',
                color: showCorrect
                  ? 'var(--brand)'
                  : showWrong
                    ? 'var(--heat)'
                    : 'var(--text)',
              }}
            >
              {renderInline(opt.label)}
            </button>
          )
        })}
      </div>
      {picked != null ? (
        <div className="mt-3 rounded-xl border border-hairline bg-bg-0 p-3">
          <div className={isCorrect ? 'text-sm font-semibold text-brand' : 'text-sm font-semibold text-heat'}>
            {isCorrect ? 'Nice read!' : 'Not quite.'}
          </div>
          {explanation && (
            <p className="mt-1 text-[13px] text-text-dim">{renderInline(explanation)}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

export function LessonBlockView({ block, onQuiz }: { block: LessonBlock; onQuiz?: (correct: boolean) => void }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="mt-2 font-display text-[22px] font-bold text-text">{renderInline(block.text)}</h2>
    case 'h3':
      return <h3 className="mt-1 font-display text-[16px] font-bold text-text">{renderInline(block.text)}</h3>
    case 'quote':
      return (
        <blockquote className="border-l-2 border-brand bg-bg-1 px-4 py-3 text-text italic">
          {renderInline(block.text)}
        </blockquote>
      )
    case 'ul':
      return (
        <ul className="ml-5 list-disc space-y-1 text-text-dim">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="ml-5 list-decimal space-y-1 text-text-dim">
          {block.items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ol>
      )
    case 'tip':
      return (
        <div className="rounded-2xl border border-info/30 bg-info/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-info">Quick tip</div>
          <p className="mt-1 text-sm text-text">{renderInline(block.text)}</p>
        </div>
      )
    case 'mistake':
      return (
        <div className="rounded-2xl border border-heat/30 bg-heat/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-heat">Watch out</div>
          <p className="mt-1 text-sm text-text">{renderInline(block.text)}</p>
        </div>
      )
    case 'coach':
      return (
        <div className="rounded-2xl border border-hairline-2 bg-bg-2 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-text-dim">Coach says</div>
          <p className="mt-1 font-display text-base italic text-text">&ldquo;{block.text}&rdquo;</p>
        </div>
      )
    case 'scenario':
      return (
        <div className="rounded-2xl border border-xp/30 bg-xp/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-xp">Mini scenario</div>
          <p className="mt-1 text-sm text-text">{renderInline(block.text)}</p>
        </div>
      )
    case 'takeaway':
      return (
        <div className="rounded-2xl border-2 border-brand bg-brand/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[1.5px] text-brand">Key takeaway</div>
          <p className="mt-1 font-display text-[16px] font-bold text-text">{renderInline(block.text)}</p>
        </div>
      )
    case 'reveal':
      return <RevealCard question={block.question} answer={block.answer} />
    case 'quiz':
      return (
        <QuizCard
          question={block.question}
          options={block.options}
          explanation={block.explanation}
          onAnswer={onQuiz}
        />
      )
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-xl bg-bg-2 p-3 text-[12px] text-text-dim">
          <code>{block.text}</code>
        </pre>
      )
    case 'p':
    default:
      return <p className="text-text-dim">{renderInline(block.text)}</p>
  }
}

/**
 * Backwards-compatible markdown renderer (single column, no pagination).
 * Used by routes that just want to dump a lesson body.
 */
export function LessonBody({ markdown }: { markdown: string }) {
  const blocks = parseLessonBlocks(markdown)
  return (
    <div className="space-y-4 text-[15px] leading-relaxed">
      {blocks.map((b, idx) => (
        <LessonBlockView key={idx} block={b} />
      ))}
    </div>
  )
}
