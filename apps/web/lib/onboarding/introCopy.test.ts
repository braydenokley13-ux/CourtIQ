/**
 * V3 P2 — intro copy contract tests.
 *
 * Lock the public surface: card ids, count, and the per-card invariants
 * the IntroCardsModal relies on. Failing here means a copy edit broke
 * the UI flow (e.g. the final card lost its CTA, or a card lost its
 * eyebrow), not just a string change.
 */

import { describe, expect, it } from 'vitest'

import {
  INTRO_CARDS,
  INTRO_CARD_COUNT,
  INTRO_FRAME_COPY,
  INTRO_HOME_BANNER,
  getIntroCard,
  type IntroCardId,
} from './introCopy'

describe('intro copy', () => {
  it('exposes the four-card walkthrough in order', () => {
    const ids: IntroCardId[] = INTRO_CARDS.map((c) => c.id)
    expect(ids).toEqual(['welcome', 'decoders', 'pathways', 'start'])
    expect(INTRO_CARD_COUNT).toBe(4)
  })

  it('every card has eyebrow / title / body and reads basketball-first', () => {
    for (const card of INTRO_CARDS) {
      expect(card.eyebrow.length).toBeGreaterThan(0)
      expect(card.title.length).toBeGreaterThan(0)
      expect(card.body.length).toBeGreaterThan(20)
    }
  })

  it('welcome card lands the watch / pick / read big idea', () => {
    const w = getIntroCard('welcome')
    const bag = `${w.title} ${w.body} ${w.bullets?.join(' ') ?? ''}`.toLowerCase()
    expect(bag).toContain('watch')
    expect(bag).toMatch(/pick|read/)
  })

  it('decoders card names all four decoders so first-time users see them', () => {
    const decoderCard = getIntroCard('decoders')
    const joined = decoderCard.bullets?.join(' ').toLowerCase() ?? ''
    expect(joined).toContain('backdoor window')
    expect(joined).toContain('empty-space cut')
    expect(joined).toContain('advantage or reset')
    expect(joined).toContain('skip the rotation')
  })

  it('pathways card mentions the Final Mix capstone', () => {
    const card = getIntroCard('pathways')
    const bag = `${card.body} ${card.bullets?.join(' ') ?? ''}`.toLowerCase()
    expect(bag).toContain('final mix')
    expect(bag).toContain('boss')
  })

  it('only the final card carries a CTA so the walkthrough ends on action', () => {
    for (const card of INTRO_CARDS) {
      if (card.id === 'start') {
        expect(card.ctaLabel).toBeTruthy()
      } else {
        expect(card.ctaLabel).toBeUndefined()
      }
    }
  })

  it('home banner sells "see how" not "read about" — coaching voice', () => {
    expect(INTRO_HOME_BANNER.title.length).toBeGreaterThan(0)
    expect(INTRO_HOME_BANNER.title.toLowerCase()).not.toContain('learn')
    expect(INTRO_HOME_BANNER.ctaLabel.length).toBeGreaterThan(0)
    expect(INTRO_HOME_BANNER.skipLabel.length).toBeGreaterThan(0)
  })

  it('frame copy provides every label the modal needs', () => {
    expect(INTRO_FRAME_COPY.closeLabel).toBeTruthy()
    expect(INTRO_FRAME_COPY.prevLabel).toBeTruthy()
    expect(INTRO_FRAME_COPY.nextLabel).toBeTruthy()
    expect(INTRO_FRAME_COPY.finalLabel).toBeTruthy()
  })

  it('getIntroCard throws on an unknown id so callers fail loud', () => {
    expect(() => getIntroCard('not-a-card' as IntroCardId)).toThrow()
  })
})
