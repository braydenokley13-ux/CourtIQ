"""Geometry helpers for the CourtIQ studio athlete (Blender 4.x/5.x, bpy).

Everything is authored locally on top of the CC0 MakeHuman base. Garments are derived
from the athlete's own surface (boolean cut + solidify) so they follow pecs, lats and
shoulders and have clean bound edges. The final stage collapses every material to ONE
texture atlas material (runtime paints the atlas per team / skin / shoe) so each LOD is a
single skinned primitive = one draw call per athlete.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

TAU = math.pi * 2

# Atlas layout (512 x 512 canvas). Top 128 px = 16 swatches of 64 px (8 per row, 2 rows).
# Below: jersey panels. Blender UV v = 1 - y/512.
SWATCH = {'skin': 0, 'hair': 1, 'trim': 2, 'shorts': 3, 'shoe': 4, 'sole': 5, 'eye_white': 6, 'feature': 7,
          'lips': 8, 'sock': 9, 'lace': 10, 'skin_shadow': 11, 'hair_hi': 12, 'accent': 13}
JERSEY_Z0, JERSEY_Z1 = .955, 1.525
JERSEY_V_MAX = .75


def swatch_uv(index):
    col, row = index % 8, index // 8
    return ((col * 64 + 32) / 512, 1 - (row * 64 + 32) / 512)


def smooth(x, a, b):
    t = max(0., min(1., (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def bell(t):
    return max(0., 1 - t * t) ** 2


def material(name, color, roughness=.75):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    return m


def new_object(name, me, link=True):
    ob = bpy.data.objects.new(name, me)
    if link:
        bpy.context.collection.objects.link(ob)
    return ob


def select_only(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def apply_modifier(ob, mod):
    select_only(ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


# ---------------------------------------------------------------------------
# Athletic shaping of the base mesh (rest T-pose coordinates; no bones move)
# ---------------------------------------------------------------------------
def shape_body(body):
    for v in body.data.vertices:
        x, y, z = v.co
        ax = abs(x)
        sgn = 1 if x >= 0 else -1
        # ---- torso: broad shoulders, V taper, lats, pecs. Fades out into the arms.
        torso_w = 1 - smooth(ax, .20, .30) if z > 1.2 else 1.
        if 1.10 < z < 1.58 and ax < .32:
            f = 1 + .15 * bell((z - 1.42) / .17) * torso_w          # shoulder line / traps
            f += .05 * bell((z - 1.28) / .13) * torso_w              # lats
            x *= f
            # pecs and upper-back depth
            if y < -.02:
                y -= .020 * bell((z - 1.37) / .11) * max(0., 1 - ax / .17)
            elif y > .02:
                y += .012 * bell((z - 1.36) / .13) * max(0., 1 - ax / .17)
        if 1.03 < z < 1.16 and ax < .22:
            x *= 1 - .055 * bell((z - 1.09) / .07)                   # waist
        # ---- neck / trapezius
        if 1.49 < z < 1.62 and ax < .10:
            x *= 1 + .16 * bell((z - 1.53) / .07)
            y = (y - .003) * (1 + .08 * bell((z - 1.53) / .07)) + .003
        # ---- thighs and calves: radial growth about the leg axis, not near the crotch seam
        if ax > .02 and z < .98:
            cx = sgn * .089
            g = 0.
            if .52 < z < .98:
                g = .115 * bell((z - .76) / .24)
            elif .20 < z < .52:
                g = .13 * bell((z - .37) / .15)
            if g:
                w = smooth(ax, .02, .06)
                dx, dy = x - cx, y - .0
                x = cx + dx * (1 + g * w)
                y = dy * (1 + g * w * .9) + .0
                if .20 < z < .52 and y > .0:
                    y += .02 * bell((z - .37) / .13) * w          # calf belly
        # ---- arms: forearms/biceps
        if ax > .2 and 1.3 < z < 1.6:
            r = bell((ax - .42) / .26)
            y2 = .065 + (y - .065) * (1 + .12 * r)
            z2 = 1.441 + (z - 1.441) * (1 + .12 * r)
            y, z = y2, z2
        v.co = Vector((x, y, z))
    # Shorter, restrained fingers read as a relaxed hand at court camera distance.
    for v in body.data.vertices:
        if abs(v.co.x) > .65:
            s = 1 if v.co.x > 0 else -1
            v.co.x = s * (.645 + (abs(v.co.x) - .645) * .82)
    body.data.update()


# ---------------------------------------------------------------------------
# Boolean helpers
# ---------------------------------------------------------------------------
def cutter_ellipsoid(center, radii, segments=24, rings=12, name='cut'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=center)
    ob = bpy.context.object
    ob.name = name
    ob.scale = radii
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def cutter_box(lo, hi, name='box'):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def cutter_elliptic_cylinder_x(x0, x1, cz, cy, rz, ry, segments=32, name='arm_cut'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments, radius=1, depth=1, location=((x0 + x1) / 2, cy, cz), rotation=(0, math.pi / 2, 0))
    ob = bpy.context.object
    ob.name = name
    # After rotating the cylinder to run along X: local X -> world -Z, local Z -> world X
    ob.scale = (rz, ry, abs(x1 - x0))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return ob


def boolean(ob, operand, op, solver='EXACT'):
    m = ob.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.object = operand
    m.solver = solver
    apply_modifier(ob, m)


def transfer_weights(ob, source):
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    for vg in source.vertex_groups:
        ob.vertex_groups.new(name=vg.name)
    select_only(ob)
    tr = ob.modifiers.new('weights', 'DATA_TRANSFER')
    tr.object = source
    tr.use_vert_data = True
    tr.data_types_verts = {'VGROUP_WEIGHTS'}
    tr.vert_mapping = 'POLYINTERP_NEAREST'
    bpy.ops.object.modifier_apply(modifier=tr.name)


def clean_mesh(ob, merge=.0004):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge)
    # drop tiny floating islands
    seen = set()
    islands = []
    for f in bm.faces:
        if f in seen:
            continue
        stack = [f]
        island = []
        seen.add(f)
        while stack:
            cur = stack.pop()
            island.append(cur)
            for e in cur.edges:
                for nb in e.link_faces:
                    if nb not in seen:
                        seen.add(nb)
                        stack.append(nb)
        islands.append(island)
    if len(islands) > 1:
        islands.sort(key=len, reverse=True)
        for island in islands[1:]:
            if len(island) < 0.2 * len(islands[0]):
                bmesh.ops.delete(bm, geom=island, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# ---------------------------------------------------------------------------
# Jersey: the athlete's own torso surface, cut to a tank-top, offset and thickened
# ---------------------------------------------------------------------------
JERSEY_HEM_HALF = .172
JERSEY_NECK = dict(center=(0, -.07, 1.535), radii=(.098, .155, .098))
JERSEY_ARM = dict(cz=1.36, cy=-.012, rz=.122, ry=.066)


def jersey_cutters():
    box = cutter_box((-.188, -.4, JERSEY_Z0), (.188, .4, 1.60), 'j_box')
    neck = cutter_ellipsoid(JERSEY_NECK['center'], JERSEY_NECK['radii'], 32, 16, 'j_neck')
    arms = [cutter_elliptic_cylinder_x(.115 * s, 1.2 * s, JERSEY_ARM['cz'], JERSEY_ARM['cy'], JERSEY_ARM['rz'], JERSEY_ARM['ry'], 40, 'j_arm') for s in (1, -1)]
    return box, neck, arms


def inside_jersey_core(co, grow=0.):
    """Is a body surface point safely under the jersey (used to delete hidden skin)?"""
    x, y, z = co
    if not (JERSEY_Z0 + .004 - grow < z < 1.49 + grow and abs(x) < .168 + grow):
        return False
    # outside armhole ellipse and neck ellipsoid (both expanded a bit)
    ay = (y - JERSEY_ARM['cy']) / (JERSEY_ARM['ry'] + .018 - grow * .5)
    az = (z - JERSEY_ARM['cz']) / (JERSEY_ARM['rz'] + .018 - grow * .5)
    if abs(x) > .10 and ay * ay + az * az < 1:
        return False
    nx = x / (JERSEY_NECK['radii'][0] + .02)
    ny = (y - JERSEY_NECK['center'][1]) / (JERSEY_NECK['radii'][1] + .02)
    nz = (z - JERSEY_NECK['center'][2]) / (JERSEY_NECK['radii'][2] + .02)
    if nx * nx + ny * ny + nz * nz < 1:
        return False
    return True


def fix_hem_weights(j):
    # The hem must move with the hips exactly like the shorts waist (no pinching V in a crouch).
    names = {g.index: g.name for g in j.vertex_groups}
    for v in j.data.vertices:
        t = 1 - smooth(v.co.z, JERSEY_Z0 - .01, 1.13)
        if t <= 0:
            continue
        infl = {names[g.group]: g.weight for g in v.groups}
        out = {n: w * (1 - t) for n, w in infl.items()}
        out['pelvis'] = out.get('pelvis', 0) + t
        for g in list(v.groups):
            j.vertex_groups[g.group].remove([v.index])
        for n, w in out.items():
            if w > 1e-4:
                j.vertex_groups[n].add([v.index], w, 'REPLACE')


def build_jersey(body, mats):
    """mats: dict name->material. Returns jersey object (skinned weights transferred)."""
    j = body.copy()
    j.data = body.data.copy()
    j.name = 'LOD0_jersey'
    bpy.context.collection.objects.link(j)
    for m in list(j.modifiers):
        j.modifiers.remove(m)
    box, neck, arms = jersey_cutters()
    boolean(j, box, 'INTERSECT')
    boolean(j, neck, 'DIFFERENCE')
    for a in arms:
        boolean(j, a, 'DIFFERENCE')
    for c in [box, neck] + arms:
        bpy.data.objects.remove(c, do_unlink=True)
    clean_mesh(j)
    # Loose, athletic cut: gap grows toward the hem; a little flare in the lower third.
    bm = bmesh.new()
    bm.from_mesh(j.data)
    bm.normal_update()
    for v in bm.verts:
        z = v.co.z
        gap = .005 + .010 * (1 - smooth(z, JERSEY_Z0, 1.32)) + .004 * bell((z - 1.40) / .09)
        n = v.normal.copy()
        if z < JERSEY_Z0 + .03:
            n.z *= max(0., (z - JERSEY_Z0) / .03)     # keep the hem edge level
            n.normalize()
        v.co += n * gap
    # Hang straight: the pelvis flares, the jersey must not. Cap the half-width per height slice
    # (hem .176 m -> chest .196 m) so the cut is a slightly tapered tube, no peplum.
    bins = {}
    for v in bm.verts:
        k = int(v.co.z * 100)
        bins[k] = max(bins.get(k, 0.), abs(v.co.x))
    for v in bm.verts:
        z = v.co.z
        if z > 1.34:
            continue
        k = int(z * 100)
        m = max(bins.get(k + d, 0.) for d in (-2, -1, 0, 1, 2))
        target = JERSEY_HEM_HALF + .022 * smooth(z, 1.0, 1.3)
        f = min(1., target / max(m, 1e-4))
        f = 1 - (1 - f) * (1 - smooth(z, 1.2, 1.34))
        v.co.x *= f
        v.co.y = (v.co.y - .012) * max(f, .9) + .012
    bm.to_mesh(j.data)
    bm.free()
    # Reduce the open shell while pinning every cut edge (neck / armholes / hem) so the bound
    # edges stay as clean as the boolean made them.
    bm = bmesh.new()
    bm.from_mesh(j.data)
    bnd = set()
    for v in bm.verts:
        if any(len(e.link_faces) == 1 for e in v.link_edges):
            bnd.add(v.index)
    ring1 = set()
    for v in bm.verts:
        if v.index in bnd:
            for e in v.link_edges:
                ring1.add(e.other_vert(v).index)
    keep = bnd | ring1
    bm.free()
    vg = j.vertex_groups.new(name='keep')
    vg.add(list(keep), 1.0, 'REPLACE')
    select_only(j)
    dm = j.modifiers.new('reduce', 'DECIMATE')
    dm.ratio = .62
    dm.vertex_group = 'keep'; dm.invert_vertex_group = True
    dm.vertex_group_factor = 1.0
    dm.use_collapse_triangulate = True
    apply_modifier(j, dm)
    j.vertex_groups.remove(j.vertex_groups['keep'])
    j.data.materials.clear()
    for m in (mats['jersey'], mats['trim']):
        j.data.materials.append(m)
    thin = j.copy()
    thin.data = j.data.copy()
    thin.name = 'LOD1_jersey'
    bpy.context.collection.objects.link(thin)
    select_only(j)
    s = j.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = .0075
    s.offset = -1                      # grow inward; the outer surface stays the garment surface
    s.use_rim = True
    s.use_rim_only = False
    s.material_offset = 0
    s.material_offset_rim = 1          # rim = trim colour binding
    s.use_even_offset = False
    apply_modifier(j, s)
    for p in j.data.polygons:
        p.use_smooth = True
    for part in (j, thin):
        transfer_weights(part, body)
        fix_hem_weights(part)
    return j, thin


def jersey_uv(co, normal_y_sign):
    x, y, z = co
    v = max(0., min(JERSEY_V_MAX, (z - JERSEY_Z0) / (JERSEY_Z1 - JERSEY_Z0) * JERSEY_V_MAX))
    return (.75 - x * 1.15, v) if normal_y_sign > 0 else (.25 + x * 1.15, v)


# ---------------------------------------------------------------------------
# Shorts: baggy double-ring tubes with a rolled, closed hem
# ---------------------------------------------------------------------------
def ring_xy(a, cx, rx, ry, sign, r=1.0):
    """Point on a leg tube ring. The inner (crotch) side is squeezed to stay clear of the
    centre line instead of being clamped flat (which made a see-through sheet in a wide stance)."""
    c = math.cos(a)
    limit = abs(cx) - .004
    rxe = rx * r
    if sign * c < 0:
        rxe = min(rxe, limit)
    return cx + rxe * c, .014 + ry * r * math.sin(a)


def build_shorts(body_skinned_source, mats):
    """Solid tapered shorts: open tubes thickened with Solidify (closed, rim = trim hem)."""
    verts = []
    faces = []
    mi = []
    weights = []
    n = 32
    for sign in (-1, 1):
        start = len(verts)
        side = 'l' if sign > 0 else 'r'
        levels = [(.585, .110, .132, sign * .100),
                  (.640, .115, .136, sign * .100),
                  (.760, .124, .144, sign * .100),
                  (.880, .122, .140, sign * .092),
                  (.960, .098, .118, sign * .060),
                  (1.000, .092, .112, sign * .054)]
        for k, (z, rx, ry, cx) in enumerate(levels):
            for i in range(n):
                a = TAU * i / n
                x, y = ring_xy(a, cx, rx, ry, sign)
                verts.append((x, y, z))
                pelvis = max(0., min(1., (z - .86) / .14)); pelvis = pelvis * pelvis * (3 - 2 * pelvis)
                weights.append([('pelvis', pelvis), ('thigh_' + side, 1 - pelvis)])
        for k in range(len(levels) - 1):
            for i in range(n):
                faces.append((start + k * n + i, start + k * n + (i + 1) % n, start + (k + 1) * n + (i + 1) % n, start + (k + 1) * n + i))
                a = TAU * (i + .5) / n
                mi.append(1 if (abs(math.cos(a)) > .975 and sign * math.cos(a) > 0 and 1 <= k <= 3) else 0)
    me = bpy.data.meshes.new('shorts')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = new_object('LOD0_shorts', me)
    for m in (mats['kit'], mats['trim'], mats['trim']):
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
        p.material_index = mi[p.index]
    assign_weights(ob, weights)
    thin = ob.copy()
    thin.data = ob.data.copy()
    thin.name = 'LOD1_shorts'
    bpy.context.collection.objects.link(thin)
    select_only(ob)
    sd = ob.modifiers.new('thick', 'SOLIDIFY')
    sd.thickness = .007
    sd.offset = -1
    sd.use_rim = True
    sd.material_offset_rim = 1
    sd.use_even_offset = False
    apply_modifier(ob, sd)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob, thin


def assign_weights(ob, weights):
    names = set(n for infl in weights for n, w in infl)
    for n in names:
        ob.vertex_groups.new(name=n)
    for i, infl in enumerate(weights):
        for n, w in infl:
            ob.vertex_groups[n].add([i], w, 'REPLACE')


def build_waistband(mats):
    verts = []
    faces = []
    weights = []
    n = 64
    for z in (.962, 1.002):
        for i in range(n):
            a = TAU * i / n
            verts.append((.183 * math.cos(a), .015 + .128 * math.sin(a), z))
            weights.append([('pelvis', 1.)])
    for i in range(n):
        faces.append((i, (i + 1) % n, (i + 1) % n + n, i + n))
    me = bpy.data.meshes.new('waistband')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = new_object('LOD0_waistband', me)
    me.materials.append(mats['trim'])
    for p in me.polygons:
        p.use_smooth = True
    assign_weights(ob, weights)
    return ob


# ---------------------------------------------------------------------------
# Shoes: chunkier lasted sneaker with mid-top collar, toe cap and sole unit
# ---------------------------------------------------------------------------
def build_shoe(side, mats):
    sign = 1 if side == 'l' else -1
    cx = sign * .089
    verts = []
    faces = []
    weights = []
    mi = []
    N = 24
    # (z, half-width, half-length, y-centre). y negative = forward (toe).
    profiles = [(.000, .062, .150, -.034), (.014, .067, .156, -.035),   # sole unit, slight bevel
                (.034, .067, .152, -.035), (.058, .063, .144, -.034),
                (.086, .054, .124, -.028), (.116, .044, .072, .014),
                (.140, .042, .058, .026), (.164, .041, .054, .032)]
    for z, rx, ry, cy in profiles:
        for i in range(N):
            a = TAU * i / N
            x = math.copysign(abs(math.cos(a)) ** .72, math.cos(a)) * rx
            y = math.copysign(abs(math.sin(a)) ** .80, math.sin(a)) * ry
            # toe box slightly pointed upward at the front, heel counter squared
            verts.append((cx + x, cy + y, z + .003))
            weights.append([('foot_' + side, 1.)])
    # shift all up a little so the sole sits on the ground plane the rig expects
    for k in range(len(profiles) - 1):
        for i in range(N):
            faces.append((k * N + i, k * N + (i + 1) % N, (k + 1) * N + (i + 1) % N, (k + 1) * N + i))
            mi.append(1 if k < 2 else 0)
    faces.append(tuple(reversed(range(N)))); mi.append(1)
    faces.append(tuple((len(profiles) - 1) * N + i for i in range(N))); mi.append(2)
    me = bpy.data.meshes.new('shoe_' + side)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = new_object('LOD0_shoe_' + side, me)
    for m in (mats['shoe'], mats['sole'], mats['sock']):
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
        p.material_index = mi[p.index]
    assign_weights(ob, weights)
    pieces = [ob]
    # Laces: raised bars across the instep
    lv = []
    lf = []
    lw = []
    lm = []
    for k in range(5):
        y = -.085 + k * .020
        z = .094 + k * .0105
        width = (.036 - k * .0025)
        start = len(lv)
        lv.extend([(cx - width, y - .004, z), (cx + width, y - .004, z), (cx + width, y + .004, z + .0), (cx - width, y + .004, z + .0)])
        lv.extend([(cx - width, y - .004, z + .006), (cx + width, y - .004, z + .006), (cx + width, y + .004, z + .006), (cx - width, y + .004, z + .006)])
        lf.extend([tuple(start + i for i in (4, 5, 6, 7)), tuple(start + i for i in (0, 1, 5, 4)), tuple(start + i for i in (1, 2, 6, 5)),
                   tuple(start + i for i in (2, 3, 7, 6)), tuple(start + i for i in (3, 0, 4, 7))])
        lw.extend([[('foot_' + side, 1.)]] * 8)
    lme = bpy.data.meshes.new('laces_' + side)
    lme.from_pydata(lv, [], lf)
    lme.update()
    lob = new_object('LOD0_laces_' + side, lme)
    lme.materials.append(mats['lace'])
    assign_weights(lob, lw)
    pieces.append(lob)
    # Ankle sock with a ribbed cuff
    sv = []
    sf = []
    sw = []
    for z, r in ((.150, .043), (.190, .041), (.214, .043), (.228, .0435)):
        for i in range(24):
            a = TAU * i / 24
            sv.append((cx + r * math.cos(a), .030 + (r + .010) * math.sin(a), z))
            sw.append([('foot_' + side, 1.)])
    for k in range(3):
        for i in range(24):
            sf.append((k * 24 + i, k * 24 + (i + 1) % 24, (k + 1) * 24 + (i + 1) % 24, (k + 1) * 24 + i))
    sme = bpy.data.meshes.new('sock_' + side)
    sme.from_pydata(sv, [], sf)
    sme.update()
    sob = new_object('LOD0_sock_' + side, sme)
    sme.materials.append(mats['sock'])
    assign_weights(sob, sw)
    pieces.append(sob)
    for p in sme.polygons:
        p.use_smooth = True
    for p in lme.polygons:
        p.use_smooth = False
    return pieces


# ---------------------------------------------------------------------------
# Hair variants, face features
# ---------------------------------------------------------------------------
HEAD_CENTER = Vector((0, -.06, 1.70))


def scalp_faces(body, hairline):
    """Face centres of the body that belong to the scalp, per hairline(co)->bool."""
    return [p.index for p in body.data.polygons if hairline(p.center)]


def default_hairline(c):
    x, y, z = c
    if z < 1.62:
        return False
    # front hairline sits on the forehead, sides drop to the temples, nape high for a fade
    front = 1.742 - .014 * smooth(-y, .10, .15)
    side = 1.715 - 0.0 * x
    back = 1.665 + .0 * y
    zline = front
    if y > -.03:
        zline = 1.715 - .05 * smooth(y, -.03, .035)
    if abs(x) > .06:
        zline = min(zline, 1.715 - .035 * smooth(abs(x), .06, .085))
    return z > zline


def build_hair(body, name, style, mats):
    """Hair shell from the athlete's scalp surface. style: dict(t_base, t_top, hairline, lift, flat)."""
    faces = scalp_faces(body, style.get('hairline', default_hairline))
    bm = bmesh.new()
    bm.from_mesh(body.data)
    keep = set(faces)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    cz = style.get('center_z', 1.70)
    # smooth the hairline loop and taper the shell toward it so no stair-steps show
    boundary = [v for v in bm.verts if any(len(e.link_faces) == 1 for e in v.link_edges)]
    for _ in range(3):
        moves = {}
        for v in boundary:
            nb = [e.other_vert(v) for e in v.link_edges if len(e.link_faces) == 1]
            if len(nb) == 2:
                moves[v] = (nb[0].co + nb[1].co + v.co * 2) / 4
        for v, c in moves.items():
            v.co = c
    ring = {v: 0 for v in boundary}
    frontier = list(boundary)
    for r in range(1, 6):
        nxt = []
        for v in frontier:
            for e in v.link_edges:
                w = e.other_vert(v)
                if w not in ring:
                    ring[w] = r
                    nxt.append(w)
        frontier = nxt
    bm.normal_update()
    for v in bm.verts:
        top = smooth(v.co.z, style.get('top_from', 1.72), style.get('top_to', 1.80))
        t = style['t_base'] + (style['t_top'] - style['t_base']) * top
        t *= min(1., .18 + .24 * ring.get(v, 5))
        dirv = v.normal.copy()
        if style.get('radial'):
            radial = (v.co - Vector((0, -.055, cz))).normalized()
            dirv = (dirv * .35 + radial * .65).normalized()
        v.co += dirv * t
        if style.get('flat'):
            v.co.z = min(v.co.z, style['flat'])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = new_object('HAIR_' + name, me)
    me.materials.append(mats['hair'])
    select_only(ob)
    s = ob.modifiers.new('thick', 'SOLIDIFY')
    s.thickness = style.get('shell', .008)
    s.offset = -1
    s.use_rim = True
    apply_modifier(ob, s)
    for p in me.polygons:
        p.use_smooth = True
    transfer_weights(ob, body)
    return ob


def snap_patch(body_bvh, pts, offset, mirror=False):
    out = []
    for x, z in pts:
        hit = body_bvh.ray_cast(Vector((x, -.5, z)), Vector((0, 1, 0)), 1.0)
        if hit[0] is None:
            out.append(Vector((x, -.18, z)))
        else:
            loc, nrm = hit[0], hit[1]
            out.append(loc + nrm * offset)
    return out


def build_face(body, mats, tone='default'):
    """Brows, eyes (white + dark iris) and a mouth line, conformed to the face surface."""
    bm0 = bmesh.new()
    bm0.from_mesh(body.data)
    bvh = BVHTree.FromBMesh(bm0)
    verts = []
    faces = []
    mi = []
    weights = []
    names = ['eye_white', 'feature', 'lips', 'skin_shadow']

    def strip(points_xz, width, offset, material):
        # polyline of (x,z) points with constant thickness in z; conformed by ray casting
        top = [(x, z + width / 2) for x, z in points_xz]
        bot = [(x, z - width / 2) for x, z in points_xz]
        a = snap_patch(bvh, top, offset)
        b = snap_patch(bvh, bot, offset)
        start = len(verts)
        for p in a + b:
            verts.append(tuple(p))
            weights.append([('Head', 1.)])
        n = len(a)
        for i in range(n - 1):
            faces.append((start + i, start + i + 1, start + n + i + 1, start + n + i))
            mi.append(material)

    def disc(cx, cz, rx, rz, offset, material, seg=14):
        ring = [(cx + rx * math.cos(TAU * i / seg), cz + rz * math.sin(TAU * i / seg)) for i in range(seg)]
        pts = snap_patch(bvh, ring + [(cx, cz)], offset)
        start = len(verts)
        for p in pts:
            verts.append(tuple(p))
            weights.append([('Head', 1.)])
        c = start + seg
        for i in range(seg):
            faces.append((start + i, start + (i + 1) % seg, c))
            mi.append(material)

    names_idx = {'eye_white': 0, 'feature': 1, 'lips': 2, 'skin_shadow': 3}
    for sgn in (-1, 1):
        ex = sgn * .0345
        # soft eye-socket shadow, then a small dark almond (no big whites)
        disc(ex, 1.6775, .0185, .0105, .0007, 3, 16)
        disc(ex, 1.676, .0105, .0058, .0012, 1, 14)
        # soft brow: thin, low arch
        pts = [(sgn * (.016 + .042 * u), 1.7025 + .007 * math.sin(math.pi * (0.1 + 0.8 * u)) - .003 * u) for u in [i / 6 for i in range(7)]]
        strip(pts, .0055, .0011, 1)
    # nose: soft shadow under the tip and along the wings
    disc(0, 1.6425, .0165, .0058, .0009, 3, 14)
    # mouth: soft line
    mouth = [(-.022 + .044 * u, 1.6275 - .0015 * math.sin(math.pi * u)) for u in [i / 8 for i in range(9)]]
    strip(mouth, .0035, .0009, 2)
    bm0.free()
    me = bpy.data.meshes.new('face')
    me.from_pydata(verts, [], faces)
    me.update()
    ob = new_object('LOD0_face', me)
    for key in names:
        me.materials.append(mats[key])
    for p in me.polygons:
        p.material_index = mi[p.index]
        p.use_smooth = True
    assign_weights(ob, weights)
    return ob


# ---------------------------------------------------------------------------
# Atlas finalisation + AO
# ---------------------------------------------------------------------------
def finalize_atlas(ob, mat_to_swatch, atlas_mat, jersey_material_name='athlete_jersey', color_attr='ao'):
    """Rewrite UVs so every polygon points at its swatch (jersey keeps real UVs), then
    collapse the material slots into one atlas material."""
    me = ob.data
    names = [m.name if m else '' for m in me.materials]
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        name = names[p.material_index] if p.material_index < len(names) else ''
        if name == jersey_material_name:
            if p.use_smooth or True:
                pass
            continue
        sw = mat_to_swatch.get(name, 'skin')
        u, v = swatch_uv(SWATCH[sw])
        for li in p.loop_indices:
            uv.data[li].uv = (u, v)
    me.materials.clear()
    me.materials.append(atlas_mat)
    for p in me.polygons:
        p.material_index = 0


def set_jersey_uvs(ob, jersey_mat_name='athlete_jersey', trim_mat_name='athlete_trim'):
    me = ob.data
    names = [m.name if m else '' for m in me.materials]
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    verts = me.vertices
    for p in me.polygons:
        name = names[p.material_index]
        if name != jersey_mat_name:
            continue
        n = p.normal
        # front / back panel by the face's dominant forward direction, seam at the sides
        side = 1 if p.center.y > .005 else -1
        for li in p.loop_indices:
            co = verts[me.loops[li].vertex_index].co
            u, v = jersey_uv(co, side)
            uv.data[li].uv = (u, v)


def bake_ao(ob, rays=20, dist=.16, strength=.48, floor=.64):
    """Per-vertex hemisphere ambient occlusion from the CURRENT evaluated pose, stored as a
    byte colour attribute 'ao' (white = open)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    # deterministic cosine-weighted hemisphere sample set
    dirs = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(rays):
        zc = (i + .5) / rays
        r = math.sqrt(1 - zc * zc)
        th = golden * i
        dirs.append(Vector((r * math.cos(th), r * math.sin(th), zc)))
    values = []
    for v in bm.verts:
        n = v.normal.normalized()
        t = n.cross(Vector((0, 0, 1)) if abs(n.z) < .9 else Vector((1, 0, 0))).normalized()
        b = n.cross(t)
        origin = v.co + n * .002
        hit = 0.
        for d in dirs:
            w = (t * d.x + b * d.y + n * d.z)
            r = bvh.ray_cast(origin, w, dist)
            if r[0] is not None:
                hit += 1 - (r[3] / dist) * .6
        occ = hit / rays
        values.append(max(floor, 1 - occ * strength * 1.5))
    # vertical tonal gradient: lower body slightly cooler/darker, tops brighter
    for i, v in enumerate(bm.verts):
        values[i] *= .90 + .10 * smooth(v.co.z, .1, 1.7)
    bm.free()
    ev.to_mesh_clear()
    attr = ob.data.color_attributes.get('ao') or ob.data.color_attributes.new('ao', 'BYTE_COLOR', 'POINT')
    for i, val in enumerate(values):
        attr.data[i].color = (val, val, val, 1)
    ob.data.color_attributes.active_color = attr
    ob.data.color_attributes.render_color_index = list(ob.data.color_attributes).index(attr)
    return values
