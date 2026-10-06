import { expect, it } from 'vitest'
import { createDefaultConfig } from '@courtiq/basketball/scenario'
import { stressAsync } from './stress'

it('cancels before computation when a run is already superseded', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(stressAsync(createDefaultConfig(), { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  })
})

it('stops a fallback batch between replay settings when superseded', async () => {
  const controller = new AbortController()
  const config = createDefaultConfig()
  config.assumptions.duration = 2
  let updates = 0
  await expect(
    stressAsync(config, {
      signal: controller.signal,
      onProgress: () => {
        updates++
        controller.abort()
      },
    }),
  ).rejects.toMatchObject({ name: 'AbortError' })
  expect(updates).toBe(1)
})
