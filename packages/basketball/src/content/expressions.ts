import type { ActorRef, Condition, Scalar, Target } from '../domain/program'
export const role = (role: string): ActorRef => ({ role })
export const current = (current: 'owner' | 'receiver' | 'reader'): ActorRef => ({ current })
export const param = (parameter: string): Scalar => ({ parameter })
export const coord = (r: string, axis: 'x' | 'z' | 'vx' | 'vz' | 'height'): Scalar => ({ coordinate: role(r), axis })
export const add = (...values: Scalar[]): Scalar => ({ op: 'add', values })
export const sub = (...values: Scalar[]): Scalar => ({ op: 'subtract', values })
export const mul = (...values: Scalar[]): Scalar => ({ op: 'multiply', values })
export const min = (...values: Scalar[]): Scalar => ({ op: 'min', values })
export const max = (...values: Scalar[]): Scalar => ({ op: 'max', values })
export const bound = (value: Scalar, min: Scalar, max: Scalar): Scalar => ({ op: 'clamp', value, min, max })
export const eq = (parameter: string, equals: string | number | boolean): Condition => ({ parameter, equals })
export const all = (...conditions: Condition[]): Condition => ({ all: conditions })
export const any = (...conditions: Condition[]): Condition => ({ any: conditions })
export const not = (condition: Condition): Condition => ({ not: condition })
export const cmp = (a: Scalar, op: 'lt' | 'lte' | 'gt' | 'gte' | 'eq', b: Scalar): Condition => ({
  compare: [a, op, b],
})
export const choice = (choose: Condition, yes: Scalar, no: Scalar): Scalar => ({ choose, yes, no })
export const select = (choose: Condition, yes: Target, no: Target): Target => ({ choose, yes, no })
export const at = (r: string, x: Scalar = 0, z: Scalar = 0, lead?: Scalar): Target => ({
  actor: role(r),
  offset: { x, z },
  ...(lead === undefined ? {} : { lead }),
})
export const components = (x: Scalar, z: Scalar): Target => ({ components: { x, z } })
export const rim = (target: Target, gap: Scalar): Target => ({ towardRim: target, gap })
export const mix = (a: Target, b: Target, amount: Scalar): Target => ({ mix: [a, b], amount })
