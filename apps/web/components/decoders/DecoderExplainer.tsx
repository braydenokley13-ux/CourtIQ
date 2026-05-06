/**
 * V3 P3 — Decoder explainer surfaces.
 *
 * Two presentational variants used everywhere a decoder is named:
 *
 *  - `DecoderExplainerCard` — full four-line read for the Pathway detail
 *    page and the progress view. Includes meaning / watch / matters /
 *    example.
 *  - `DecoderChip` — short pill with the label + one-liner subtitle.
 *
 * Both pull from the canonical `lib/decoders/explanations.ts` module so
 * a copy change in one place flows through every surface.
 */

import {
  getAccentColor,
  getDecoderAccent,
} from '@/lib/pathways/helpers'
import type { DecoderTag } from '@/lib/pathways/types'
import {
  getDecoderExplanation,
  getDecoderOneLiner,
} from '@/lib/decoders/explanations'

export function DecoderExplainerCard({
  tag,
  className,
}: {
  tag: DecoderTag
  className?: string
}) {
  const e = getDecoderExplanation(tag)
  const accent = getAccentColor(getDecoderAccent(tag))

  return (
    <article
      data-decoder-tag={tag}
      data-testid={`decoder-explainer-${tag}`}
      className={[
        'overflow-hidden rounded-2xl border bg-bg-1',
        className ?? '',
      ].join(' ')}
      style={{ borderColor: `${accent}40` }}
    >
      <header
        className="px-4 py-3"
        style={{ background: `linear-gradient(180deg, ${accent}1f, transparent)` }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-[1.5px]"
          style={{ color: accent }}
        >
          Decoder
        </p>
        <p className="mt-0.5 font-display text-[16px] font-bold leading-tight text-text">
          {e.label}
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-text-dim">
          {e.oneLiner}
        </p>
      </header>
      <dl className="space-y-2 px-4 py-3 text-[13px] leading-snug text-text">
        <ExplainerRow label="What it means" body={e.meaning} accent={accent} />
        <ExplainerRow label="What to watch" body={e.watch} accent={accent} />
        <ExplainerRow label="Why it matters" body={e.matters} accent={accent} />
        <ExplainerRow label="Quick example" body={e.example} accent={accent} />
      </dl>
    </article>
  )
}

function ExplainerRow({
  label,
  body,
  accent,
}: {
  label: string
  body: string
  accent: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: accent }}
      />
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] font-bold uppercase tracking-[1.5px] text-text-mute">
          {label}
        </dt>
        <dd className="mt-0.5 text-text">{body}</dd>
      </div>
    </div>
  )
}

export function DecoderChip({ tag }: { tag: DecoderTag }) {
  const accent = getAccentColor(getDecoderAccent(tag))
  const e = getDecoderExplanation(tag)
  return (
    <span
      data-decoder-tag={tag}
      className="inline-flex max-w-full flex-col gap-0.5 rounded-2xl border bg-bg-2 px-3 py-2"
      style={{ borderColor: `${accent}55` }}
      title={e.oneLiner}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[1.4px]"
        style={{ color: accent }}
      >
        {e.label}
      </span>
      <span className="text-[11px] leading-snug text-text-dim">
        {getDecoderOneLiner(tag)}
      </span>
    </span>
  )
}

export function AllDecodersExplainerGrid({ className }: { className?: string }) {
  return (
    <div
      className={[
        'grid grid-cols-1 gap-3 sm:grid-cols-2',
        className ?? '',
      ].join(' ')}
    >
      <DecoderExplainerCard tag="BACKDOOR_WINDOW" />
      <DecoderExplainerCard tag="EMPTY_SPACE_CUT" />
      <DecoderExplainerCard tag="ADVANTAGE_OR_RESET" />
      <DecoderExplainerCard tag="SKIP_THE_ROTATION" />
    </div>
  )
}
