'use client'

import { createContext, useContext } from 'react'

interface SceneMotionContextValue {
  reduced: boolean
}

const SceneMotionContext = createContext<SceneMotionContextValue>({ reduced: false })

export function SceneMotionProvider({
  reduced,
  children,
}: {
  reduced: boolean
  children: React.ReactNode
}) {
  return (
    <SceneMotionContext.Provider value={{ reduced }}>{children}</SceneMotionContext.Provider>
  )
}

export function useSceneMotion(): SceneMotionContextValue {
  return useContext(SceneMotionContext)
}
