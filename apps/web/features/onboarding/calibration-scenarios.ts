import type { CourtState } from '@/components/court/types'

export interface CalibrationChoice {
  id: string
  label: string
  order: number
  is_correct: boolean
  feedback_text: string
}

export interface CalibrationScenario {
  id: string
  difficulty: 1 | 2 | 3 | 4 | 5
  prompt: string
  user_role: string
  court_state: CourtState
  choices: CalibrationChoice[]
  explanation_md: string
}

export const CALIBRATION_SCENARIOS: CalibrationScenario[] = [
  {
    id: 'cal_001',
    difficulty: 1,
    prompt: 'Your teammate drives baseline. As the weak-side wing, what do you do?',
    user_role: 'weak_side_wing',
    court_state: {
      offense: [
        { id: 'pg', x: 250, y: 280, hasBall: true, label: 'PG', role: 'ball_handler' },
        { id: 'you', x: 80, y: 200, hasBall: false, label: 'YOU', glow: true },
        { id: 'sf', x: 430, y: 200, hasBall: false, label: 'SF' },
      ],
      defense: [
        { id: 'd1', x: 265, y: 255, label: 'D1' },
        { id: 'd2', x: 95, y: 220, label: 'D2' },
        { id: 'd3', x: 445, y: 220, label: 'D3' },
      ],
      ball_location: { x: 250, y: 280 },
      motion_cues: [
        { from: [250, 280], to: [200, 100], color: '#3BE383', dashed: false },
      ],
    },
    choices: [
      { id: 'a', label: 'Cut backdoor to the basket', order: 0, is_correct: true, feedback_text: 'Creates a passing lane and pulls your defender away from the paint.' },
      { id: 'b', label: 'Stay put in the corner', order: 1, is_correct: false, feedback_text: 'Standing still clogs the paint and leaves your defender free to help.' },
      { id: 'c', label: 'Drift toward the ball', order: 2, is_correct: false, feedback_text: 'Moving toward the drive collapses spacing and blocks the lane.' },
      { id: 'd', label: 'Set a screen for the driver', order: 3, is_correct: false, feedback_text: "Too late — the drive has already started. You'd cause a collision." },
    ],
    explanation_md: 'When a teammate drives, weak-side players cut or space to the corner — never drift toward the ball. Your job is to pull your defender away from the paint, not crowd it.',
  },
  {
    id: 'cal_002',
    difficulty: 2,
    prompt: "A screen is coming for your man. The screener's defender is nearby. Best move?",
    user_role: 'on_ball_defender',
    court_state: {
      offense: [
        { id: 'pg', x: 250, y: 280, hasBall: true, label: 'PG', role: 'ball_handler' },
        { id: 'sg', x: 420, y: 180, hasBall: false, label: 'SG' },
        { id: 'sc', x: 310, y: 220, hasBall: false, label: 'SC', role: 'screener' },
      ],
      defense: [
        { id: 'you', x: 400, y: 190, label: 'YOU', glow: true },
        { id: 'd2', x: 320, y: 205, label: 'D2' },
        { id: 'd3', x: 265, y: 260, label: 'D3' },
      ],
      ball_location: { x: 250, y: 280 },
      motion_cues: [
        { from: [310, 220], to: [370, 200], color: '#FF4D6D', dashed: true },
      ],
    },
    choices: [
      { id: 'a', label: 'Fight over the screen, stay with my man', order: 0, is_correct: true, feedback_text: 'Getting over the screen keeps you between your man and the basket.' },
      { id: 'b', label: 'Switch immediately with D2', order: 1, is_correct: false, feedback_text: 'Switching hands off a shooter to a bigger, slower defender — bad trade.' },
      { id: 'c', label: 'Go under the screen', order: 2, is_correct: false, feedback_text: 'Going under gives your man a clean look from three.' },
      { id: 'd', label: 'Zone up and stop moving', order: 3, is_correct: false, feedback_text: 'Zoning up on a mismatch situation leaves shooters wide open.' },
    ],
    explanation_md: 'Get over screens on shooters. Going under gives up wide-open threes. Switching works sometimes, but only when the matchup trade is acceptable.',
  },
  {
    id: 'cal_003',
    difficulty: 3,
    prompt: "The ball handler beats their defender. You're weak-side help. What do you do?",
    user_role: 'weak_side_help',
    court_state: {
      offense: [
        { id: 'pg', x: 150, y: 150, hasBall: true, label: 'PG', role: 'ball_handler' },
        { id: 'sf', x: 80, y: 300, hasBall: false, label: 'SF' },
        { id: 'c', x: 270, y: 120, hasBall: false, label: 'C' },
      ],
      defense: [
        { id: 'd1', x: 180, y: 180, label: 'D1' },
        { id: 'you', x: 330, y: 200, label: 'YOU', glow: true },
        { id: 'd3', x: 80, y: 280, label: 'D3' },
      ],
      ball_location: { x: 150, y: 150 },
      motion_cues: [
        { from: [150, 150], to: [200, 80], color: '#3BE383', dashed: false },
        { from: [180, 180], to: [160, 165], color: '#FF4D6D', dashed: true },
      ],
    },
    choices: [
      { id: 'a', label: 'Step up to help at the rim, then recover', order: 0, is_correct: true, feedback_text: 'Stopping the drive is the priority. Recover to your man after.' },
      { id: 'b', label: 'Stay locked on my man at all times', order: 1, is_correct: false, feedback_text: 'Staying home lets the driver score easily at the rim.' },
      { id: 'c', label: 'Sprint to double the ball handler', order: 2, is_correct: false, feedback_text: 'Hard doubling leaves your man open for an easy kick-out and score.' },
      { id: 'd', label: 'Crash the offensive boards', order: 3, is_correct: false, feedback_text: 'The play is live — this is the worst possible read.' },
    ],
    explanation_md: 'Help defense means stepping up to protect the rim when a teammate gets beat, then recovering. The goal is to force a pass, not let the driver score free.',
  },
  {
    id: 'cal_004',
    difficulty: 4,
    prompt: "2-on-1 fast break. You're the lone defender. What's your primary job?",
    user_role: 'lone_defender',
    court_state: {
      offense: [
        { id: 'pg', x: 200, y: 300, hasBall: true, label: 'PG', role: 'ball_handler' },
        { id: 'sf', x: 350, y: 280, hasBall: false, label: 'SF' },
      ],
      defense: [
        { id: 'you', x: 250, y: 180, label: 'YOU', glow: true },
      ],
      ball_location: { x: 200, y: 300 },
      motion_cues: [
        { from: [200, 300], to: [220, 200], color: '#3BE383', dashed: false },
        { from: [350, 280], to: [340, 180], color: '#3BE383', dashed: false },
      ],
    },
    choices: [
      { id: 'a', label: 'Stop the ball, protect the rim, force a pass', order: 0, is_correct: true, feedback_text: 'Buy time. Force the ball handler to pass and let help get back.' },
      { id: 'b', label: 'Guard the off-ball player', order: 1, is_correct: false, feedback_text: 'Ignoring the ball handler means a layup. Always stop the ball first.' },
      { id: 'c', label: 'Commit hard and steal the ball', order: 2, is_correct: false, feedback_text: 'Gambling lets the passer cut and scores easily.' },
      { id: 'd', label: 'Retreat to the paint and wait', order: 3, is_correct: false, feedback_text: 'Retreating concedes the lane and the jumper. You have to engage.' },
    ],
    explanation_md: "On a 2-on-1, stop the ball first — hover in the lane, make the ball handler think twice, and force the pass. Your job is to buy time, not win the possession solo.",
  },
  {
    id: 'cal_005',
    difficulty: 5,
    prompt: "Ball is swung to your man in the corner. You're closing out. What's the right technique?",
    user_role: 'closing_out',
    court_state: {
      offense: [
        { id: 'sg', x: 440, y: 280, hasBall: true, label: 'SG', role: 'shooter' },
        { id: 'pg', x: 200, y: 280, hasBall: false, label: 'PG' },
      ],
      defense: [
        { id: 'you', x: 330, y: 200, label: 'YOU', glow: true },
        { id: 'd2', x: 210, y: 270, label: 'D2' },
      ],
      ball_location: { x: 440, y: 280 },
      motion_cues: [
        { from: [200, 280], to: [440, 280], color: '#3BE383', dashed: true },
      ],
    },
    choices: [
      { id: 'a', label: 'Sprint at full speed and fly past them', order: 0, is_correct: false, feedback_text: "A ball fake will freeze you and they'll drive past you for a layup." },
      { id: 'b', label: 'Short choppy steps, hand up, body under control', order: 1, is_correct: true, feedback_text: 'Controlled closeout: contest the shot without fouling or blowing by.' },
      { id: 'c', label: 'Jog out and challenge from distance', order: 2, is_correct: false, feedback_text: 'Too slow — gives up an uncontested three-pointer.' },
      { id: 'd', label: 'Stay back in help position', order: 3, is_correct: false, feedback_text: 'Leaving a corner shooter open is one of the most punished mistakes in basketball.' },
    ],
    explanation_md: 'Closeout technique: sprint halfway, then chop your feet as you approach. Hand high, body under control. Never fly past — a pump fake will send you flying and leave them open.',
  },
]

/**
 * Computes starting IQ (500–900) from calibration attempts.
 * Weights: correctness (main factor) + speed bonus (secondary).
 */
export function computeCalibrationIQ(
  attempts: Array<{ is_correct: boolean; time_ms: number }>
): number {
  let score = 0
  const maxScore = attempts.length * 3

  for (const a of attempts) {
    if (a.is_correct) {
      score += 2
      if (a.time_ms < 3000) score += 1
      else if (a.time_ms < 7000) score += 0.5
    }
  }

  const ratio = maxScore > 0 ? score / maxScore : 0
  return Math.round(500 + ratio * 400)
}
