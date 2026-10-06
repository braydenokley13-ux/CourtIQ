"""CourtIQ basketball motion library (Blender 4.3+ / 5.x, bpy).

All motion is authored locally and procedurally: no motion capture, no third-party
clips. Poses are solved in armature space (feet/hands as IK targets, pelvis and spine
as FK rotations), then baked to local TRS by build_studio_athlete.py.

Two clip families
-----------------
* time-driven loops (ready stances, screen, pass, catch...) - runtime plays them by
  absolute simulation time.
* distance-driven locomotion loops (walk, jog, sprint, slides, backpedal, chop) - one
  loop covers exactly STRIDE[name] metres of ground. Planted feet move backward in body
  space at exactly the body's ground speed, so the runtime sets
      cycle = groundDistance / STRIDE
  and the planted foot has no skating. `bake()` measures how far the solved ankle
  misses its planted target (IK reach) and reports it as `plantError`.

Axes (armature space): +Z up, forward = -Y, character-left = +X.
"""
import math
from mathutils import Vector, Matrix, Quaternion

TAU = math.pi * 2
FOOT_Z = .1037                      # ankle height with a flat foot
BALL_FWD, BALL_DOWN = .149, .089    # ankle -> ball-of-foot offset (flat foot)
REACH = .800                        # leg reach cap (rest chain is .822): knees never lock


def smooth(x):
    x = max(0., min(1., x))
    return x * x * (3 - 2 * x)


def lerp(a, b, t):
    return a + (b - a) * t


def plant_weight(foot):
    """0..1 'foot is on the court' marker baked into the GLB; the runtime foot-lock IK uses it."""
    return float(foot.get('plant', 1.0))


# ---------------------------------------------------------------------------
# Rig solver
# ---------------------------------------------------------------------------
class Rig:
    def __init__(self, rig):
        self.rig = rig
        self.bones = rig.pose.bones
        for b in self.bones:
            b.rotation_mode = 'QUATERNION'
        self.REST = {b.name: b.matrix.copy() for b in self.bones}
        self.REST_FOOT = {s: self.REST['foot_' + s].to_quaternion() for s in 'lr'}
        self.REST_PELVIS = self.REST['pelvis'].translation.copy()
        self.upd = None

    def update(self):
        import bpy
        bpy.context.view_layer.update()

    def reset(self):
        for b in self.bones:
            b.matrix_basis = Matrix.Identity(4)
        self.update()

    def aim(self, name, child, target):
        b = self.bones[name]
        origin = b.matrix.translation.copy()
        current = self.bones[child].matrix.translation - origin
        desired = Vector(target) - origin
        if current.length < 1e-6 or desired.length < 1e-6:
            return
        delta = current.rotation_difference(desired)
        loc, rot, scale = b.matrix.decompose()
        b.matrix = Matrix.LocRotScale(loc, delta @ rot, scale)
        self.update()

    def two_bone(self, a, b, c, target, pole):
        origin = self.bones[a].matrix.translation.copy()
        middle = self.bones[b].matrix.translation.copy()
        end = self.bones[c].matrix.translation.copy()
        l1 = (middle - origin).length
        l2 = (end - middle).length
        axis = Vector(target) - origin
        distance = max(.025, min(axis.length, l1 + l2 - .006))
        axis.normalize()
        along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance)
        bend = Vector(pole) - origin
        perp = bend - axis * bend.dot(axis)
        if perp.length < .0001:
            perp = Vector((0, -1, 0))
        perp.normalize()
        knee = origin + axis * along + perp * math.sqrt(max(.0001, l1 * l1 - along * along))
        self.aim(a, b, knee)
        self.aim(b, c, origin + axis * distance)

    def orient(self, name, quat):
        b = self.bones[name]
        loc, rot, scale = b.matrix.decompose()
        b.matrix = Matrix.LocRotScale(loc, quat, scale)
        self.update()

    def rot_world(self, name, axis, angle):
        if abs(angle) < 1e-7:
            return
        b = self.bones[name]
        loc, rot, scale = b.matrix.decompose()
        b.matrix = Matrix.LocRotScale(loc, Quaternion(axis, angle) @ rot, scale)
        self.update()

    def set_translation(self, name, t):
        b = self.bones[name]
        m = b.matrix.copy()
        m.translation = t
        b.matrix = m
        self.update()

    def twist_forearm(self, side, roll):
        """Pronation/supination about the elbow->wrist axis, shared by forearm and hand."""
        lo, hand = 'lowerarm_' + side, 'hand_' + side
        axis = (self.bones[hand].matrix.translation - self.bones[lo].matrix.translation)
        if axis.length < 1e-6:
            return
        axis.normalize()
        self.rot_world(lo, axis, roll * .45)
        self.rot_world(hand, axis, roll * .55)


# ---------------------------------------------------------------------------
# Foot / gait generator
# ---------------------------------------------------------------------------
def ankle_pitch_delta(theta):
    """Ankle displacement when the foot rotates `theta` (toe down +) about the ball."""
    c, s = math.cos(theta), math.sin(theta)
    dz = BALL_FWD * s + BALL_DOWN * (c - 1)
    dy = BALL_FWD * (c - 1) - BALL_DOWN * s     # forward is -Y
    return dy, dz


def foot_cycle(q, g):
    """One foot over one cycle. Returns (along, lift, pitch, comp_dy, comp_dz).
    `along` is the foot position along the direction of travel (positive = ahead of
    the body). In stance it falls linearly by L*s (exactly the distance the body
    covers), so the foot is stationary on the court."""
    s, L = g['s'], g['L']
    half = L * s / 2
    toe, hs, lift_h = g.get('toe', .4), g.get('hs', .1), g.get('lift', .1)
    if q < s:
        along = half - L * q
        lift = 0.
        settle = .16 * s
        theta = -hs * (1 - q / settle) if q < settle else 0.
        heel_off = g.get('heel_off', .6) * s
        if q > heel_off:
            theta = toe * smooth((q - heel_off) / (s - heel_off))
        cdy, cdz = ankle_pitch_delta(theta) if theta > 0 else (0., 0.)
        return along, lift, theta, cdy, cdz
    u = (q - s) / (1 - s)
    e = g.get('ease', .35)
    ease = smooth(u) * (1 - e) + (u ** 1.5 * (3 - 2 * u ** 1.5) if e else 0) * e
    along = -half + L * s * ease
    lift = lift_h * math.sin(math.pi * (u ** g.get('lift_skew', .8)))
    theta_exit = toe * (1 - smooth(u / .35))
    theta = theta_exit + (-hs) * smooth((u - .55) / .45)
    cdy, cdz = ankle_pitch_delta(theta_exit) if theta_exit > 0 else (0., 0.)
    return along, lift, theta, cdy, cdz


# ---------------------------------------------------------------------------
# Pose application
# ---------------------------------------------------------------------------
def apply_pose(R, P):
    """P keys: pelvis (dx,dy,dz), pelvis_rot (pitch, roll, yaw), spine (pitch, roll, yaw),
    head (pitch, roll, yaw), feet[2] = dict(pos, pitch, yaw), hands[2] = dict(pos, pole,
    roll), knee_out."""
    dx, dy, dz = P['pelvis']
    feet = P['feet']

    def place(dz):
        R.reset()
        R.set_translation('pelvis', R.REST_PELVIS + Vector((dx, dy, dz)))
        pr = P.get('pelvis_rot', (0, 0, 0))
        R.rot_world('pelvis', (1, 0, 0), pr[0]); R.rot_world('pelvis', (0, 1, 0), pr[1]); R.rot_world('pelvis', (0, 0, 1), pr[2])
        sp = P.get('spine', (0, 0, 0))
        for name, k in (('spine_01', .3), ('spine_02', .3), ('spine_03', .4)):
            R.rot_world(name, (1, 0, 0), sp[0] * k); R.rot_world(name, (0, 1, 0), sp[1] * k); R.rot_world(name, (0, 0, 1), sp[2] * k)
        # Keep every hip within leg reach: lower the pelvis rather than overextend a leg.
        worst = 0.
        for side, foot in zip('lr', feet):
            hip = R.bones['thigh_' + side].matrix.translation
            t = Vector(foot['target'])
            h = math.hypot(hip.x - t.x, hip.y - t.y)
            if math.hypot(h, hip.z - t.z) > REACH:
                worst = max(worst, hip.z - t.z - math.sqrt(max(0., REACH * REACH - h * h)))
        return worst

    for _ in range(6):
        worst = place(dz)
        if worst < .0008:
            break
        dz -= worst
    else:
        place(dz)
    # Head stays level and looks through the play.
    hp, hr, hy = P.get('head', (0, 0, 0))
    R.rot_world('neck_01', (1, 0, 0), hp * .4); R.rot_world('Head', (1, 0, 0), hp * .6)
    R.rot_world('neck_01', (0, 1, 0), hr * .4); R.rot_world('Head', (0, 1, 0), hr * .6)
    R.rot_world('neck_01', (0, 0, 1), hy * .4); R.rot_world('Head', (0, 0, 1), hy * .6)
    chest_delta = R.bones['spine_03'].matrix @ R.REST['spine_03'].inverted()
    ko = P.get('knee_out', .12)
    for side, sign, foot in zip('lr', (1, -1), feet):
        t = Vector(foot['target'])
        hip = R.bones['thigh_' + side].matrix.translation
        pole = (hip.x + sign * ko, hip.y - .9, hip.z - .05)
        R.two_bone('thigh_' + side, 'calf_' + side, 'foot_' + side, t, pole)
        q = Quaternion((0, 0, 1), foot.get('yaw', 0.)) @ Quaternion((1, 0, 0), foot.get('pitch', 0.)) @ R.REST_FOOT[side]
        R.orient('foot_' + side, q)
    for side, sign, hand in zip('lr', (1, -1), P['hands']):
        pos = chest_delta @ Vector(hand['pos'])
        pole = chest_delta @ Vector(hand['pole'])
        R.two_bone('upperarm_' + side, 'lowerarm_' + side, 'hand_' + side, pos, pole)
        R.twist_forearm(side, hand.get('roll', 0.))
        wr = hand.get('wrist', 0.)   # wrist flexion about the world X-ish axis of the hand
        if wr:
            R.rot_world('hand_' + side, (1, 0, 0), wr)
    R.update()


# ---------------------------------------------------------------------------
# Clip definitions
# ---------------------------------------------------------------------------
def hand(x, y, z, pole, roll=0., wrist=0.):
    return {'pos': (x, y, z), 'pole': pole, 'roll': roll, 'wrist': wrist}


def gait_pose(spec, p):
    """Distance-driven locomotion: spec gives gait + posture; p is cycle phase 0..1."""
    d = spec['dir']                       # unit travel direction, armature XY
    s, L = spec['s'], spec['L']
    drop = spec['drop']
    cyc = TAU * p
    feet = []
    base_dz_extra = 0.
    for side, sign, offset in (('l', 1, 0.), ('r', -1, .5)):
        q = (p + offset) % 1
        along, lift, theta, cdy, cdz = foot_cycle(q, spec)
        bx, by = spec['base'](sign)
        x = bx + d[0] * along
        y = by + d[1] * along + cdy
        z = FOOT_Z + lift + cdz
        pl = 0.0 if q >= spec['s'] else smooth((spec['s'] - q) / (.12 * spec['s']))
        feet.append({'target': (x, y, z), 'pitch': theta, 'yaw': spec['foot_yaw'](sign), 'plant': pl})
    # Pelvis: bob (up at mid-stance for walking, up in flight for running), lateral
    # weight transfer over the stance foot, forward travel of the hips.
    mid = s / 2
    bob = spec['bounce'] * math.cos(2 * cyc - TAU * 2 * mid)
    sway = spec['sway'] * math.cos(cyc - TAU * mid)
    pelvis = (sway, spec.get('pelvis_y', 0.), -drop + bob)
    lean = spec['lean']
    swing = spec['twist']
    P = {
        'pelvis': pelvis,
        'pelvis_rot': (lean * .45, -sway * 1.3 + spec.get('roll', 0) * math.cos(cyc), -swing * .6 * math.cos(cyc)),
        'spine': (lean * .55, sway * 1.2, swing * math.cos(cyc)),
        'head': (-lean * .85, 0., -swing * .5 * math.cos(cyc)),
        'feet': feet,
        'knee_out': spec.get('knee_out', .08),
    }
    P['hands'] = spec['arms'](p, cyc)
    return P


def v(*a):
    return Vector(a)


# Arm layouts -------------------------------------------------------------
def arms_run(amp, lift, z0, y0, x, bend):
    def f(p, cyc):
        out = []
        for sign in (1, -1):
            c = math.cos(cyc) * sign      # +: this arm is back when left foot lands
            # left arm goes back (y+) when the left foot lands: positive c -> +y
            hp = (sign * x, y0 + amp * c, z0 - lift * c)
            out.append(hand(*hp, pole=(sign * (x + .2), .22 + .06 * c, z0 - .24 - bend), roll=sign * -.2))
        return out
    return f


def arms_defensive_moving(p_lo=.0, wave=.05):
    """Active hands while travelling: lead hand high / trail hand low-wide, alternating."""
    def f(p, cyc):
        out = []
        for sign in (1, -1):
            w = math.sin(cyc * 2 + (0 if sign > 0 else 1.9)) * wave
            if sign > 0:   # left
                out.append(hand(.42, -.24 + w, 1.50 + w, (.58, .08, 1.18), roll=-.9))
            else:          # right low and wide
                out.append(hand(-.52, -.16 - w, 1.02 + w * .6, (-.52, .10, 1.00), roll=.5))
        return out
    return f


def arms_backpedal(p, cyc):
    out = []
    for sign in (1, -1):
        w = math.sin(cyc + (0 if sign > 0 else math.pi)) * .05
        if sign > 0:
            out.append(hand(.40, -.30 + w, 1.46 + w, (.56, .06, 1.16), roll=-.9))
        else:
            out.append(hand(-.46, -.20 - w, 1.12, (-.52, .08, 1.02), roll=.5))
    return out


def arms_walk(p, cyc):
    out = []
    for sign in (1, -1):
        c = math.cos(cyc) * sign
        out.append(hand(sign * .30, -.02 + .10 * c, 1.02 - .03 * c, (sign * .42, .20, .90), roll=sign * -.15))
    return out


def arms_chop(p, cyc):
    out = []
    for sign in (1, -1):
        w = math.sin(cyc * 2 + (0 if sign > 0 else 1.9)) * .03
        if sign > 0:
            out.append(hand(.34, -.30 + w, 1.88 + w, (.60, -.04, 1.50), roll=-1.3))
        else:
            out.append(hand(-.44, -.22 - w, 1.12 + w, (-.50, .06, 1.02), roll=.5))
    return out


def base_c(c, stagger=0.):
    return lambda sign: (sign * c, stagger * sign * -1)


def make_specs():
    S = {}
    S['walk'] = dict(dir=(0, -1), L=1.45, s=.62, toe=.45, hs=.2, lift=.065, drop=.03, bounce=.014, sway=.02,
                     lean=.05, twist=.10, base=base_c(.095), foot_yaw=lambda sg: sg * .05, arms=arms_walk, heel_off=.55)
    S['jog'] = dict(dir=(0, -1), L=2.25, s=.38, toe=.45, hs=.1, lift=.17, drop=.075, bounce=-.032, sway=.018, lean=.15,
                    twist=.22, base=base_c(.095), foot_yaw=lambda sg: sg * .03,
                    arms=arms_run(.20, .09, 1.12, -.14, .24, .04), heel_off=.5, lift_skew=.75)
    S['sprint'] = dict(dir=(0, -1), L=3.1, s=.27, toe=.55, hs=0., lift=.30, drop=.105, bounce=-.05, sway=.012, lean=.30,
                       twist=.34, base=base_c(.085), foot_yaw=lambda sg: 0., pelvis_y=-.03,
                       arms=arms_run(.34, .17, 1.15, -.16, .22, .06), heel_off=.45, lift_skew=.7, knee_out=.04)
    # Two slide gaits per direction. Foot-gap geometry limits one gait to a narrow
    # speed band (feet may neither cross nor spread beyond ~1 m), so a short-step slide
    # covers slow/medium speeds and a hop-slide (brief flight) covers fast ones.
    for suffix, dirx in (('left', 1), ('right', -1)):
        yaw = (lambda dx: (lambda sg: dx * .10 + sg * .08))(dirx)
        S['defense_slide_' + suffix] = dict(dir=(dirx, 0), L=.90, s=.40, toe=.30, hs=0., lift=.035, drop=.31, bounce=.003, sway=.026,
                                          lean=.50, twist=.05, base=base_c(.30), foot_yaw=yaw, arms=arms_defensive_moving(),
                                          heel_off=.7, knee_out=.20, ease=.1, roll=.03 * dirx)
        S['defense_slide_fast_' + suffix] = dict(dir=(dirx, 0), L=1.50, s=.25, toe=.35, hs=0., lift=.09, drop=.30, bounce=-.006, sway=.02,
                                               lean=.50, twist=.06, base=base_c(.33), foot_yaw=yaw, arms=arms_defensive_moving(.0, .07),
                                               heel_off=.6, knee_out=.16, ease=.3, roll=.035 * dirx)
    S['backpedal'] = dict(dir=(0, 1), L=1.75, s=.50, toe=.30, hs=-.12, lift=.085, drop=.28, bounce=.004, sway=.022,
                          lean=.30, twist=.10, base=base_c(.20), foot_yaw=lambda sg: sg * .08, arms=arms_backpedal,
                          heel_off=.7, knee_out=.14)
    S['chop'] = dict(dir=(0, -1), L=1.05, s=.56, toe=.25, hs=0., lift=.06, drop=.29, bounce=-.012, sway=.03,
                     lean=.48, twist=.05, base=base_c(.20), foot_yaw=lambda sg: sg * .12, arms=arms_chop,
                     heel_off=.7, knee_out=.16, ease=.1)
    return S


GAITS = make_specs()
# Ground distance covered by ONE loop of each locomotion clip, metres.
STRIDE = {n: g['L'] for n, g in GAITS.items()}
DISTANCE_CLIPS = list(GAITS)


# Time-driven clips ----------------------------------------------------------
def stand(c=.17, stagger=(0., 0.), drop=.1, pitch=.1, yaw=.0, toe_out=.08, pitch_foot=.0, extra=None):
    """Two planted feet. stagger = (left_y, right_y) offsets, negative = forward."""
    feet = []
    for side, sign, sy in (('l', 1, stagger[0]), ('r', -1, stagger[1])):
        dy, dz = ankle_pitch_delta(pitch_foot)
        feet.append({'target': (sign * c, sy + dy, FOOT_Z + dz), 'pitch': pitch_foot, 'yaw': sign * toe_out + yaw})
    return feet


def pose_offense_ready(t, dur):
    cyc = TAU * t / dur
    shift = math.sin(cyc)
    feet = stand(.175, (-.02, -.09), pitch_foot=.07)
    hands = []
    for sign in (1, -1):
        w = math.sin(cyc * 2 + (0 if sign > 0 else 1.3)) * .012
        hands.append(hand(sign * .17, -.34 + w, 1.20 + w, (sign * .40, -.02, 1.08), roll=sign * -.45))
    return {'pelvis': (.012 * shift, .01, -.115 + .006 * math.sin(cyc * 2)), 'pelvis_rot': (.10, -.012 * shift, .05 * shift),
            'spine': (.10, .01 * shift, -.03 * shift), 'head': (-.10, 0, .05 * math.sin(cyc + .4)),
            'feet': feet, 'hands': hands, 'knee_out': .10}


def pose_defense_ready(t, dur):
    cyc = TAU * t / dur
    shift = math.sin(cyc)
    feet = stand(.33, (-.12, .06), toe_out=.16, pitch_foot=.20)
    # Active hands: a high "mirror" hand in the passing lane and a low wide hand that
    # trade places slowly; quiet fingers wiggle is carried by the small wave terms.
    a = .5 + .5 * math.sin(cyc)
    hands = []
    hands.append(hand(.32, -.27 - .03 * a, 1.56 + .06 * a, (.52, .04, 1.20), roll=-1.1))
    hands.append(hand(-.48, -.17 - .03 * (1 - a), 1.06 - .07 * a + .05 * (1 - a), (-.52, .10, .95), roll=.5))
    return {'pelvis': (.014 * shift, -.05, -.31 + .006 * math.sin(cyc * 2)), 'pelvis_rot': (.32, -.015 * shift, -.06 * shift),
            'spine': (.36, .02 * shift, .05 * shift), 'head': (-.36, 0, .06 * math.sin(cyc * .5 + .6)),
            'feet': feet, 'hands': hands, 'knee_out': .24}


def pose_receive(t, dur):
    """Catch-ready: knees bent, hands up as a target, softly cycling target -> shot pocket."""
    cyc = TAU * t / dur
    k = .5 - .5 * math.cos(cyc)
    feet = stand(.215, (-.02, -.10), toe_out=.10, pitch_foot=.08)
    hands = []
    for sign in (1, -1):
        hands.append(hand(sign * lerp(.20, .13, k), lerp(-.52, -.38, k), lerp(1.42, 1.30, k),
                          (sign * .42, -.04, lerp(1.20, 1.08, k)), roll=sign * -1.1))
    return {'pelvis': (0, .005, -.135 - .012 * k), 'pelvis_rot': (.12, 0, 0), 'spine': (.12, 0, 0), 'head': (-.12, 0, 0),
            'feet': feet, 'hands': hands, 'knee_out': .13}


def pose_screen_plant(t, dur):
    cyc = TAU * t / dur
    feet = stand(.30, (-.03, -.03), toe_out=.02, pitch_foot=.03)
    tension = .004 * math.sin(cyc * 6)
    hands = [hand(-.045, -.27, 1.30 + tension, (.40, -.10, 1.18), roll=.9),
             hand(.045, -.28, 1.26 - tension, (-.40, -.10, 1.14), roll=-.9)]   # arms folded across the chest
    return {'pelvis': (0, 0, -.175 + tension), 'pelvis_rot': (.06, 0, 0), 'spine': (.06, 0, 0), 'head': (-.06, 0, .03 * math.sin(cyc)),
            'feet': feet, 'hands': hands, 'knee_out': .18}


def pose_screen_fight(t, dur):
    """Fighting over a screen: shoulders turned through the gap, hips low, tiny steps."""
    cyc = TAU * t / dur
    turn = .5
    feet = []
    for side, sign, ph in (('l', 1, 0.), ('r', -1, .5)):
        q = (t / dur + ph) % 1
        step = math.sin(math.pi * q * 2) if q < .5 else 0.
        feet.append({'target': (sign * .25 + (.04 if sign > 0 else -.02), (-.14 if sign > 0 else .04) - .04 * math.sin(cyc), FOOT_Z + .05 * max(0, step)),
                     'pitch': .1, 'yaw': .35 + (.0 if sign > 0 else .1), 'plant': 1 - smooth(max(0, step) / .2)})
    hands = [hand(.12, -.42, 1.30, (.40, -.02, 1.05), roll=-1.0),                 # lead hand through the gap
             hand(-.38, -.04, 1.17, (-.44, .20, 1.02), roll=.5)]                   # back arm tucked
    return {'pelvis': (-.02 + .02 * math.sin(cyc), .0, -.20), 'pelvis_rot': (.15, .02, .20), 'spine': (.20, 0, -turn),
            'head': (-.2, 0, turn * .8), 'feet': feet, 'hands': hands, 'knee_out': .15}


def pose_closeout(t, dur):
    """Chop steps in place, high contest hand, second hand taking space."""
    cyc = TAU * t / dur
    feet = []
    for side, sign, ph in (('l', 1, 0.), ('r', -1, .5)):
        q = (t / dur * 2 + ph) % 1
        up = math.sin(math.pi * q) ** 1.5 if q < .5 else 0.
        # note: q wraps twice per clip -> four chops per loop
        feet.append({'target': (sign * .21, (-.10 if sign > 0 else .02) - .015 * math.sin(cyc * 2), FOOT_Z + .055 * up),
                     'pitch': .08 + .1 * up, 'yaw': sign * .10, 'plant': 1 - smooth(up / .25)})
    hands = [hand(.34, -.30, 1.90 + .02 * math.sin(cyc * 2), (.60, -.04, 1.50), roll=-1.3),
             hand(-.46, -.22, 1.20 + .03 * math.sin(cyc * 2 + 1), (-.50, .06, 1.04), roll=.5)]
    return {'pelvis': (.012 * math.sin(cyc * 2), -.05, -.30 + .010 * math.cos(cyc * 4)), 'pelvis_rot': (.30, 0, 0),
            'spine': (.38, 0, .05), 'head': (-.38, 0, 0), 'feet': feet, 'hands': hands, 'knee_out': .18}


def pose_pivot(t, dur):
    cyc = TAU * t / dur
    phi = .62 * math.sin(cyc)
    pivot = Vector((.12, -.10, 0))
    # Planted pivot foot (left) turns in place; free foot steps around it, ball protected.
    free = pivot + Quaternion((0, 0, 1), phi) @ Vector((-.27, .03, 0))
    lift = .03 * abs(math.cos(cyc))
    feet = [{'target': (pivot.x, pivot.y, FOOT_Z), 'pitch': .15, 'yaw': phi * .5, 'plant': 1.0},
            {'target': (free.x, free.y, FOOT_Z + lift), 'pitch': .0, 'yaw': phi * .8 - .1, 'plant': 0.0}]
    hands = [hand(.20, -.32, 1.12, (.40, -.0, 1.0), roll=-.5), hand(-.20, -.34, 1.10, (-.42, -.0, 1.0), roll=.5)]
    return {'pelvis': (.02 * math.sin(cyc), 0, -.12), 'pelvis_rot': (.12, 0, .40 * math.sin(cyc)), 'spine': (.12, 0, .18 * math.sin(cyc)),
            'head': (-.1, 0, -.20 * math.sin(cyc)), 'feet': feet, 'hands': hands, 'knee_out': .1}


def step_plant(e):
    """Foot is planted at the ends of a step (e = 0 or 1) and travelling in between."""
    return 1 - smooth((e - .03) / .12) * (1 - smooth((e - .86) / .1))


def pose_chest_pass(t, dur):
    cyc = TAU * t / dur
    e = .5 - .5 * math.cos(cyc)
    feet = stand(.19, (-.03, -.10 - .10 * e), pitch_foot=.08)
    feet[1]['plant'] = step_plant(e)
    hands = []
    for sign in (1, -1):
        hands.append(hand(sign * lerp(.10, .15, e), lerp(-.22, -.64, e), lerp(1.30, 1.34, e),
                          (sign * .34, lerp(.05, -.10, e), 1.12), roll=sign * lerp(-.4, -1.45, e), wrist=lerp(0, .25, e)))
    return {'pelvis': (0, -.03 * e, -.115 - .02 * (1 - e)), 'pelvis_rot': (.10 + .08 * e, 0, 0), 'spine': (.10 + .10 * e, 0, 0),
            'head': (-.14, 0, 0), 'feet': feet, 'hands': hands, 'knee_out': .10}


def pose_skip_pass(t, dur):
    """Two-hand overhead skip pass: gather over/behind the head, whip forward."""
    cyc = TAU * t / dur
    e = .5 - .5 * math.cos(cyc)
    feet = stand(.20, (-.02, -.12 - .12 * e), pitch_foot=.09)
    feet[1]['plant'] = step_plant(e)
    hands = []
    for sign in (1, -1):
        hands.append(hand(sign * lerp(.12, .15, e), lerp(-.04, -.62, e), lerp(1.98, 1.78, e),
                          (sign * .30, lerp(.18, .0, e), lerp(1.55, 1.62, e)), roll=sign * lerp(-.5, -1.4, e), wrist=lerp(-.1, .4, e)))
    return {'pelvis': (0, -.03 * e, -.11 - .02 * (1 - e)), 'pelvis_rot': (.04 + .10 * e, 0, 0), 'spine': (-.08 + .30 * e, 0, 0),
            'head': (-.04 - .1 * e, 0, 0), 'feet': feet, 'hands': hands, 'knee_out': .10}


def pose_shot_release(t, dur):
    cyc = TAU * t / dur
    e = .5 - .5 * math.cos(cyc)
    feet = stand(.20, (-.02, -.08), pitch_foot=.05 + .30 * e)
    hands = []
    for sign in (1, -1):
        hands.append(hand(sign * lerp(.12, .07, e), lerp(-.22, -.30, e), lerp(1.50, 1.98, e),
                          (sign * lerp(.30, .26, e), lerp(-.04, -.12, e), lerp(1.34, 1.70, e)), roll=sign * -1.2, wrist=lerp(0, .5, e)))
    return {'pelvis': (0, 0, -.14 + .13 * e), 'pelvis_rot': (.08, 0, 0), 'spine': (.08 - .06 * e, 0, 0),
            'head': (-.08 + .1 * e, 0, 0), 'feet': feet, 'hands': hands, 'knee_out': .10}


def pose_dribble(t, dur):
    cyc = TAU * t / dur
    k = .5 + .5 * math.cos(cyc)
    feet = stand(.19, (-.02, -.09), pitch_foot=.08)
    hands = [hand(.30, -.38, 1.20, (.46, -.02, 1.05), roll=-.6),                                      # protection arm
             hand(-.31, -.30, .78 + .26 * k, (-.42, .05, 1.0), roll=.9, wrist=-.35 * k + .1)]          # live ball hand
    return {'pelvis': (0, 0, -.12), 'pelvis_rot': (.10, 0, .04), 'spine': (.12, 0, .04), 'head': (-.12, 0, 0),
            'feet': feet, 'hands': hands, 'knee_out': .10}


def pose_cut_plant(t, dur):
    """Plant-and-cut: decelerate onto the outside (right) foot, drop the hips, load,
    then drive off the other way. Loops; runtime can sample it by plant amount."""
    cyc = TAU * t / dur
    k = .5 - .5 * math.cos(cyc)       # 0 = approaching, 1 = fully loaded plant
    feet = [{'target': (.20 + .06 * k, -.20 + .06 * k, FOOT_Z + .1 * (1 - k) ** 2 * (1 if k < .2 else 0)), 'pitch': .15 * (1 - k), 'yaw': .15 * k, 'plant': smooth((k - .15) / .3)},
            {'target': (-.30 - .12 * k, -.08 - .10 * k, FOOT_Z), 'pitch': .05, 'yaw': -.55 * k, 'plant': smooth((k - .05) / .2)}]
    hands = [hand(.30, -.20 - .1 * k, 1.12, (.46, .10, 1.0), roll=-.5), hand(-.36 - .1 * k, -.12, 1.02 + .08 * k, (-.52, .08, .96), roll=.5)]
    return {'pelvis': (-.09 * k, -.02, -.10 - .13 * k), 'pelvis_rot': (.18 + .08 * k, .10 * k, .18 * k), 'spine': (.18 + .10 * k, .05 * k, -.25 * k),
            'head': (-.2, 0, .3 * k), 'feet': feet, 'hands': hands, 'knee_out': .16}


# name -> (pose fn, duration seconds)
LOOPS = {
    'offense_ready': (pose_offense_ready, 2.4),
    'defense_ready': (pose_defense_ready, 2.0),
    'receive': (pose_receive, 1.2),
    'screen_plant': (pose_screen_plant, 2.0),
    'screen_fight': (pose_screen_fight, 1.2),
    'closeout': (pose_closeout, 1.0),
    'pivot': (pose_pivot, 1.4),
    'cut_plant': (pose_cut_plant, 1.0),
    'chest_pass': (pose_chest_pass, .8),
    'skip_pass': (pose_skip_pass, 1.0),
    'shot_release': (pose_shot_release, 1.0),
    'dribble': (pose_dribble, .8),
}
FRAMES_PER_GAIT = 24
KEY_BONES = ['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r',
             'lowerarm_l', 'lowerarm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r']


def clip_frames():
    """Yield (name, frame_count, duration_seconds, pose_for_frame(i), meta)."""
    for name, (fn, dur) in LOOPS.items():
        frames = round(dur * 24)
        yield name, frames, frames / 24, (lambda i, fn=fn, dur=dur, frames=frames: fn(i / frames * (frames / 24), frames / 24)), {'mode': 'time'}
    for name, spec in GAITS.items():
        frames = FRAMES_PER_GAIT
        yield name, frames, frames / 24, (lambda i, spec=spec, frames=frames: gait_pose(spec, i / frames)), {'mode': 'distance', 'strideMeters': spec['L'], 'stanceFraction': spec['s']}
