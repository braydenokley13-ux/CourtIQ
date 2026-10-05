/* @vitest-environment jsdom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogProvider } from './posthog'

const mocks = vi.hoisted(() => ({ pathname:'/', createClient:vi.fn(), init:vi.fn(), identify:vi.fn(), capture:vi.fn(), reset:vi.fn(), unsubscribe:vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname:() => mocks.pathname, useSearchParams:() => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ createClient:mocks.createClient }))
vi.mock('posthog-js', () => ({ default:{ init:mocks.init, identify:mocks.identify, capture:mocks.capture, reset:mocks.reset } }))
vi.mock('posthog-js/react', () => ({ PostHogProvider:({children}:{children:React.ReactNode}) => children, usePostHog:() => ({capture:mocks.capture}) }))
let root:Root
let host:HTMLDivElement
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY','test-analytics-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','')
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  host=document.createElement('div'); document.body.appendChild(host); root=createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllEnvs() })
describe('public laboratory service independence', () => {
  it.each(['/','/lab'])('renders %s with no service credentials or analytics initialization',async pathname => {
    mocks.pathname=pathname
    mocks.createClient.mockImplementation(() => { throw new Error('Missing Supabase credentials') })
    await act(async () => root.render(<PostHogProvider><p>Coach our answer</p></PostHogProvider>))
    expect(host.textContent).toBe('Coach our answer')
    expect(mocks.createClient).not.toHaveBeenCalled()
    expect(mocks.init).not.toHaveBeenCalled()
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('keeps legacy authenticated routes connected and cleans up their subscription',async () => {
    mocks.pathname='/dashboard'
    mocks.createClient.mockReturnValue({auth:{getSession:async () => ({data:{session:null}}),onAuthStateChange:() => ({data:{subscription:{unsubscribe:mocks.unsubscribe}}})}})
    await act(async () => root.render(<PostHogProvider><p>Legacy dashboard</p></PostHogProvider>))
    expect(mocks.createClient).toHaveBeenCalledOnce()
    expect(mocks.init).toHaveBeenCalledOnce()
    expect(mocks.capture).toHaveBeenCalledWith('$pageview',expect.objectContaining({$current_url:expect.stringContaining('/dashboard')}))
    await act(async () => root.render(<PostHogProvider>{null}</PostHogProvider>))
    await act(async () => root.unmount())
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    root=createRoot(host)
  })
})
