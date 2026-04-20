export type Position = 'PG' | 'SG' | 'SF' | 'PF' | 'C' | 'ALL'
export type SkillLevel = 'ROOKIE' | 'VARSITY' | 'ELITE'
export type UserRole = 'PLAYER' | 'PARENT' | 'COACH' | 'TRAINER' | 'ADMIN'
export type Category = 'OFFENSE' | 'DEFENSE' | 'TRANSITION' | 'SITUATIONAL'
export type ScenarioStatus = 'DRAFT' | 'REVIEW' | 'LIVE' | 'RETIRED'
export type BadgeFamily = 'CONCEPT' | 'MILESTONE' | 'ACCURACY'

export interface IQDelta {
  before: number
  after: number
  delta: number
  source: 'scenario' | 'calibration'
}
