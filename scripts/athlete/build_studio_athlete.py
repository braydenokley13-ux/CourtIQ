"""CourtIQ basketball athlete DCC production build (Blender 4.3+ / bpy 5.x).

python3 scripts/athlete/build_studio_athlete.py            (full build + export)
GEOMETRY_ONLY=1 python3 scripts/athlete/build_studio_athlete.py   (stop after meshes, save blend)

Consumes the CC0 anatomical bind mesh built by build_lab_human.py. Authors the shaped body,
uniform (cut from the athlete's own surface), footwear, hair variants, face features,
baked ambient occlusion, a single texture-atlas material (one draw call per athlete),
three mesh LODs, and the deterministic in-place basketball action library.
Everything in this file is locally authored, not downloaded motion capture.
"""
import bpy, bmesh, math, os, json, sys
from mathutils import Vector, Matrix, Quaternion
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import athlete_geo as G
ROOT = os.path.abspath(os.path.join(HERE, '../..'))
OUT = ROOT + '/apps/web/public/athlete'
SOURCE = OUT + '/lab-human.glb'
TAU = math.pi * 2
FPS = 24
GEOMETRY_ONLY = bool(os.environ.get('GEOMETRY_ONLY'))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
body = bpy.data.objects['Mannequin_F']
body.name = 'LOD0_body'
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o != body:
        bpy.data.objects.remove(o, do_unlink=True)
rig.name = 'CourtIQ_basketball_rig'
rig.data.pose_position = 'REST'
print('body matrix identity?', body.matrix_world == Matrix.Identity(4), 'rig', rig.matrix_world == Matrix.Identity(4))
body.data.materials.clear()

MATS = {}
for name, color, rough in [
        ('athlete_skin', (.43, .235, .135), .7), ('athlete_hair', (.018, .021, .018), .94),
        ('athlete_jersey', (.018, .13, .135), .84), ('athlete_trim', (.80, .82, .70), .76),
        ('athlete_kit', (.018, .13, .135), .84), ('athlete_shoe', (.055, .075, .068), .57),
        ('athlete_sole', (.70, .73, .67), .80), ('athlete_eye_white', (.9, .9, .88), .4),
        ('athlete_feature', (.03, .02, .02), .6), ('athlete_lips', (.35, .16, .12), .6),
        ('athlete_sock', (.85, .86, .82), .8), ('athlete_lace', (.9, .9, .88), .7)]:
    MATS[name[8:]] = G.material(name, color, rough)
MATS['jersey'].name = 'athlete_jersey'
SWATCH_OF = {'athlete_skin': 'skin', 'athlete_hair': 'hair', 'athlete_trim': 'trim', 'athlete_kit': 'shorts', 'athlete_shoe': 'shoe',
             'athlete_sole': 'sole', 'athlete_eye_white': 'eye_white', 'athlete_feature': 'feature', 'athlete_lips': 'lips',
             'athlete_sock': 'sock', 'athlete_lace': 'lace'}

# ---- 1. shape the base body, derive garments / hair / face from it
G.shape_body(body)
body.data.materials.append(MATS['skin'])
for p in body.data.polygons:
    p.use_smooth = True
jersey = G.build_jersey(body, MATS)
HAIR_STYLES = {
    'crop': dict(t_base=.0045, t_top=.013, shell=.008),
    'buzz': dict(t_base=.0025, t_top=.005, shell=.004),
    'hightop': dict(t_base=.008, t_top=.052, shell=.012, top_from=1.715, top_to=1.78, flat=1.855,
                    hairline=lambda c: G.default_hairline((c[0], c[1], c[2] - (.012 if c[1] < -.02 else 0)))),
    'afro': dict(t_base=.030, t_top=.058, shell=.020, radial=True, top_from=1.68, top_to=1.78,
                 hairline=lambda c: c[2] > (1.700 - .035 * G.smooth(abs(c[0]), .05, .09) + (.012 if c[1] < -.05 else 0))
                 if c[1] < .035 else c[2] > 1.655),
}
hairs = []
for hname, style in HAIR_STYLES.items():
    hairs.append(G.build_hair(body, hname, style, MATS))
face = G.build_face(body, MATS)

# Hidden body surface is cut before LOD generation (no skin/uniform intersections).
bm = bmesh.new()
bm.from_mesh(body.data)
remove = []
for f in bm.faces:
    c = f.calc_center_median()
    x, y, z = c
    if G.inside_jersey_core(c):
        remove.append(f)
    elif .62 < z < 1.04 and abs(x) < .27:
        remove.append(f)
    elif z < .122:
        remove.append(f)
bmesh.ops.delete(bm, geom=remove, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(body.data)
bm.free()
body.data.update()
select = G.select_only
select(body)
mod = body.modifiers.new('Production body reduction', 'DECIMATE')
mod.ratio = .5
bpy.ops.object.modifier_apply(modifier=mod.name)

select(jersey)
jm = jersey.modifiers.new('Jersey reduction', 'DECIMATE')
jm.ratio = .62
bpy.ops.object.modifier_apply(modifier=jm.name)
pieces = [jersey, face]
pieces.append(G.build_shorts(body, MATS))
pieces.append(G.build_waistband(MATS))
for side in 'lr':
    pieces.extend(G.build_shoe(side, MATS))

for ob in [body] + pieces:
    ob.data.calc_loop_triangles(); print('PIECE', ob.name, len(ob.data.loop_triangles))
# ---- 2. join into LOD0, rig-bind every part
for ob in pieces + hairs:
    ob.parent = rig
    arm = ob.modifiers.new('Basketball deformation', 'ARMATURE')
    arm.object = rig
bpy.ops.object.select_all(action='DESELECT')
for ob in [body] + pieces:
    ob.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = 'LOD0_athlete'
G.set_jersey_uvs(body)
ATLAS = G.material('athlete_atlas', (1, 1, 1), .62)
nt = ATLAS.node_tree
attr_node = nt.nodes.new('ShaderNodeVertexColor')
attr_node.layer_name = 'ao'
nt.links.new(attr_node.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
G.finalize_atlas(body, SWATCH_OF, ATLAS)
for h in hairs:
    G.finalize_atlas(h, SWATCH_OF, ATLAS)


def normalize_weights(ob, keep=4):
    for v in ob.data.vertices:
        w0 = sorted([(g.weight, g.group) for g in v.groups if g.weight > .0001], reverse=True)[:keep]
        total = sum(w for w, g in w0)
        for g in list(v.groups):
            ob.vertex_groups[g.group].remove([v.index])
        if total:
            for w, g in w0:
                ob.vertex_groups[g].add([v.index], w / total, 'REPLACE')


normalize_weights(body)
for h in hairs:
    normalize_weights(h)


def make_lod(src, name, ratio, merge_fingers=True):
    lod = src.copy()
    lod.data = src.data.copy()
    bpy.context.collection.objects.link(lod)
    lod.name = name
    select(lod)
    m = lod.modifiers.new('Reduction', 'DECIMATE')
    m.ratio = ratio
    m.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=m.name)
    # Re-attach the armature modifier (decimate must run on the unposed mesh).
    if merge_fingers:
        for v in lod.data.vertices:
            remap = {}
            for g in list(v.groups):
                n = lod.vertex_groups[g.group].name
                if any(s in n for s in ['thumb', 'index', 'middle', 'ring', 'pinky']):
                    n = 'hand_' + n[-1]
                remap[n] = remap.get(n, 0) + g.weight
            for g in list(v.groups):
                lod.vertex_groups[g.group].remove([v.index])
            total = sum(remap.values())
            for n, w in remap.items():
                lod.vertex_groups[n].add([v.index], w / total, 'REPLACE')
    lod.hide_render = True
    return lod


lod = make_lod(body, 'LOD1_athlete', .34)
lod2 = make_lod(body, 'LOD2_athlete', .12)

# ---- 3. rig bind: relaxed curled hands baked into the bind pose, ambient occlusion in a
# real basketball stance, then the animation library.
rig.data.pose_position = 'POSE'
sys.path.insert(0, HERE)
import motion_lib
bpy.context.view_layer.objects.active = rig
for b in rig.pose.bones:
    b.rotation_mode = 'QUATERNION'
    if any(n in b.name for n in ['index_', 'middle_', 'ring_', 'pinky_']) and not b.name.endswith('leaf_l') and not b.name.endswith('leaf_r'):
        b.rotation_quaternion = Quaternion((1, 0, 0), .20)
bpy.context.view_layer.update()
ALL_MESHES = [body, lod, lod2] + hairs
for ob in ALL_MESHES:
    select(ob)
    for m in list(ob.modifiers):
        if m.type == 'ARMATURE':
            bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='POSE')
bpy.ops.pose.armature_apply(selected=False)
bpy.ops.object.mode_set(mode='OBJECT')
for ob in ALL_MESHES:
    mod = ob.modifiers.new('Basketball deformation', 'ARMATURE')
    mod.object = rig
bpy.context.view_layer.update()
R = motion_lib.Rig(rig)
bones = rig.pose.bones
KEY_BONES = motion_lib.KEY_BONES

# Ambient occlusion baked in a defensive stance (arms away from the torso, knees bent).
P0 = motion_lib.pose_defense_ready(0.0, 2.0)
motion_lib.apply_pose(R, P0)
bpy.context.view_layer.update()
for ob in ALL_MESHES:
    G.bake_ao(ob)
R.reset()

if GEOMETRY_ONLY:
    bpy.ops.wm.save_as_mainfile(filepath=ROOT + '/scripts/athlete/source/lab-athlete-geometry.blend', compress=True)
    for ob in ALL_MESHES:
        ob.data.calc_loop_triangles()
        print('TRIS', ob.name, len(ob.data.loop_triangles), 'verts', len(ob.data.vertices))
    sys.exit(0)


def fcurves_of(action):
    # Blender 4.x exposes action.fcurves; 5.x moved them into slotted layers/strips.
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    return [c for l in action.layers for st in l.strips for cb in st.channelbags for c in cb.fcurves]


rig.animation_data_create()
metrics = []
plant_tables = {}
for name, frames, actual, fn, meta in motion_lib.clip_frames():
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    minimum = 10
    maximum = -10
    miss = 0
    plant = {'l': [], 'r': []}
    for f in range(frames + 1):
        bpy.context.scene.frame_set(f)
        P = fn(f % frames)
        motion_lib.apply_pose(R, P)
        for key in KEY_BONES:
            b = bones[key]
            b.keyframe_insert(data_path='location', frame=f, group=key)
            b.keyframe_insert(data_path='rotation_quaternion', frame=f, group=key)
        for s, foot in zip(['l', 'r'], P['feet']):
            a = bones['foot_' + s].matrix.translation
            z = a.z
            minimum = min(minimum, z)
            maximum = max(maximum, z)
            miss = max(miss, (a - Vector(foot['target'])).length)
            plant[s].append(round(motion_lib.plant_weight(foot), 2))
    for curve in fcurves_of(action):
        for k in curve.keyframe_points:
            k.interpolation = 'LINEAR'
    entry = {'name': name, 'duration': actual, 'frames': frames + 1, 'ankleHeightMin': round(minimum, 4), 'ankleHeightMax': round(maximum, 4), 'ikMissMax': round(miss, 4), 'rootMotion': False}
    entry.update(meta)
    entry['plant'] = plant
    metrics.append(entry)
rig.animation_data.action = None
R.reset()
bpy.context.scene.render.fps = FPS
# Keep production source editable: meshes, palette, rig and all reusable actions.
sourcepath = ROOT + '/scripts/athlete/source/lab-athlete-studio.blend'
bpy.ops.wm.save_as_mainfile(filepath=sourcepath, compress=True)
# Main optimized asset contains every LOD + hair variant on ONE skeleton, so switching LOD
# never doubles animation mixers or skeleton updates. Source remains in the blend.
bpy.ops.object.select_all(action='DESELECT')
for ob in [rig] + ALL_MESHES:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
kwargs = dict(export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
              export_frame_range=False, export_optimize_animation_size=True, export_skins=True, export_def_bones=True, export_yup=True,
              export_extras=True)
bpy.ops.export_scene.gltf(filepath=OUT + '/lab-athlete.glb', **kwargs)
bpy.ops.object.select_all(action='DESELECT')
for ob in [rig, lod2] + hairs:
    ob.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=OUT + '/lab-athlete-tactical.glb', **kwargs)
from optimize_studio_glb import optimize
motion_meta = {'version': 3, 'fps': FPS, 'atlas': {'size': 512, 'swatch': G.SWATCH, 'jerseyZ': [G.JERSEY_Z0, G.JERSEY_Z1], 'jerseyV': G.JERSEY_V_MAX},
               'hair': list(HAIR_STYLES),
               'clips': {m['name']: {k: m[k] for k in ('mode', 'duration', 'strideMeters', 'stanceFraction', 'plant') if k in m} for m in metrics}}
for filename in ['lab-athlete.glb', 'lab-athlete-tactical.glb']:
    print(optimize(OUT + '/' + filename, motion_meta))
for ob in ALL_MESHES:
    ob.data.calc_loop_triangles()
report = {'generator': 'Blender ' + bpy.app.version_string, 'fps': FPS, 'heightMeters': 1.808, 'sourceBlend': 'scripts/athlete/source/lab-athlete-studio.blend',
          'meshes': {ob.name: {'vertices': len(ob.data.vertices), 'triangles': len(ob.data.loop_triangles)} for ob in ALL_MESHES},
          'lod0': {'vertices': len(body.data.vertices), 'triangles': len(body.data.loop_triangles)},
          'lod1': {'vertices': len(lod.data.vertices), 'triangles': len(lod.data.loop_triangles)},
          'lod2': {'vertices': len(lod2.data.vertices), 'triangles': len(lod2.data.loop_triangles)},
          'clips': [{k: v for k, v in m.items() if k != 'plant'} for m in metrics],
          'bytes': {n: os.path.getsize(OUT + '/' + n) for n in ['lab-athlete.glb', 'lab-athlete-tactical.glb']}}
with open(OUT + '/lab-athlete-build.json', 'w') as f:
    json.dump(report, f, indent=2)
print('COURTIQ_STUDIO_BUILD', json.dumps({k: v for k, v in report.items() if k != 'clips'}))
