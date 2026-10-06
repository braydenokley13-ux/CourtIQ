import { describe, expect, it } from 'vitest'
import { GET } from './route'

// The only API left is a process probe; it has no service imports or remote I/O.
describe('GET /api/health', () => {
  it('returns a healthy process response without a database readiness field', async () => {
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.uptime_s).toBeGreaterThanOrEqual(0)
    expect(typeof body.commit).toBe('string')
    expect(body).not.toHaveProperty('db')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})
