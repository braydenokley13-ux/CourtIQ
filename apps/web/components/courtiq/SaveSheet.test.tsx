// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import SaveSheet from './SaveSheet'

let node: HTMLDivElement, root: Root
beforeEach(() => {
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true })
  node = document.createElement('div')
  document.body.append(node)
  root = createRoot(node)
})
afterEach(async () => {
  await act(async () => root.unmount())
  node.remove()
})

function props(head = 'v1') {
  return {
    config: createDefaultConfig(),
    voice: { register: 'plain' as const },
    defaultName: 'Our answer',
    accepts: [],
    knownBreaks: [],
    existingVersions: () => 1,
    matches: [{ id: 'answer-1', name: 'Our answer', scope: 'varsity' as const, headVersionId: head }],
    busy: false,
    onSave: vi.fn(),
    onClose: vi.fn(),
  }
}
function saveButton() {
  return [...node.querySelectorAll('button')].find(
    (button) => button.textContent?.startsWith('Update') || button.textContent === 'Save',
  )!
}

describe('Save editor concurrency', () => {
  it('keeps the head reviewed when Lab opened even if props refresh while the editor is open', async () => {
    const initial = { ...props(), originEntryId: 'answer-1', originExpectedHeadVersionId: 'v1' }
    await act(async () => root.render(<SaveSheet {...initial} />))
    await act(async () =>
      root.render(<SaveSheet {...initial} matches={props('v2').matches} originExpectedHeadVersionId="v2" />),
    )
    await act(async () => saveButton().click())
    expect(initial.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targetEntryId: 'answer-1', expectedHeadVersionId: 'v1' }),
      false,
    )
  })

  it('captures a head when an existing target is explicitly selected and retains it on refresh', async () => {
    const initial = props()
    await act(async () => root.render(<SaveSheet {...initial} />))
    const selector = node.querySelector('select')!
    await act(async () => {
      selector.value = 'answer-1'
      selector.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => root.render(<SaveSheet {...initial} matches={props('v2').matches} />))
    await act(async () => saveButton().click())
    expect(initial.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ targetEntryId: 'answer-1', expectedHeadVersionId: 'v1' }),
      false,
    )
  })

  it('prevents a second acceptance while a device transaction is pending and shows accessible errors', async () => {
    const initial = props()
    await act(async () => root.render(<SaveSheet {...initial} busy error="Device save did not complete" />))
    const primary = [...node.querySelectorAll('button')].find((button) => button.textContent === 'Saving…')!
    expect(primary.disabled).toBe(true)
    expect(node.querySelector('[role="status"]')?.textContent).toBe('Device save did not complete')
    await act(async () => primary.click())
    expect(initial.onSave).not.toHaveBeenCalled()
  })
})
