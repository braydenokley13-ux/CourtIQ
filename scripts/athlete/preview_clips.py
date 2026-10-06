"""Fast Workbench contact sheets for motion review (CPU, no GPU/browser needed).

python3 scripts/athlete/preview_clips.py OUT_DIR [clip,clip,...] [phases=6]

For each clip: a row of side views and a row of front views at evenly spaced phases.
Distance-driven clips move the athlete across a 0.25 m floor grid exactly as the
runtime does (travel = phase * stride), so a planted foot must stay on its grid cell.
"""
import bpy, os, sys, json, math
from mathutils import Vector
from PIL import Image, ImageDraw
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
build = json.load(open(ROOT + '/apps/web/public/athlete/lab-athlete-build.json'))
meta = {c['name']: c for c in build['clips']}
names = sys.argv[2].split(',') if len(sys.argv) > 2 and sys.argv[2] != 'all' else list(meta)
n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
bpy.ops.wm.open_mainfile(filepath=ROOT + '/scripts/athlete/source/lab-athlete-studio.blend')
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for ob in bpy.data.objects:
    if ob.name.startswith('LOD1'): ob.hide_render = True
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 10; scene.cycles.use_denoising = False; scene.cycles.device = 'CPU'
scene.view_settings.view_transform = 'Standard'
scene.render.resolution_x, scene.render.resolution_y = 240, 330
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (.8, .82, .86, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.1
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.6; so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(35))
# floor grid: thin dark lines every 0.25 m, heavier every metre
import bmesh
bm = bmesh.new()
for i in range(-24, 25):
    for axis in (0, 1):
        w = .008 if i % 4 else .016
        a = i * .25
        if axis == 0: pts = [(a - w, -6, 0), (a + w, -6, 0), (a + w, 6, 0), (a - w, 6, 0)]
        else: pts = [(-6, a - w, 0), (6, a - w, 0), (6, a + w, 0), (-6, a + w, 0)]
        bm.faces.new([bm.verts.new(p) for p in pts])
me = bpy.data.meshes.new('grid'); bm.to_mesh(me); grid = bpy.data.objects.new('grid', me); scene.collection.objects.link(grid); grid.location.z = .001
def flat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1); m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 1; return m
me.materials.append(flat('g', (.02, .02, .03)))
fm = flat('f', (.75, .70, .58))
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -.002)); fl = bpy.context.object; fl.data.materials.append(fm)
def cam(name, offset):
    d = bpy.data.cameras.new(name); d.type = 'ORTHO'; d.ortho_scale = 2.35
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); return o
cams = {'side': cam('side', None), 'front': cam('front', None)}
def aim_cam(o, target, eye):
    o.location = eye; o.rotation_euler = (target - eye).to_track_quat('-Z', 'Y').to_euler()
rig.animation_data_create()
for name in names:
    c = meta[name]; frames = c['frames'] - 1
    action = bpy.data.actions[name]; rig.animation_data.action = action
    dist = c.get('mode') == 'distance'
    L = c.get('strideMeters', 0)
    # travel direction in armature space for distance clips
    dvec = (1, 0) if name.endswith('_left') else (-1, 0) if name.endswith('_right') else (0, 1) if name == 'backpedal' else (0, -1)
    sheet = Image.new('RGB', (240 * n, 330 * 2 + 24), (30, 30, 34)); draw = ImageDraw.Draw(sheet)
    draw.text((6, 4), f"{name}  ({c.get('mode')}, {c['duration']:.2f}s" + (f", stride {L} m, stance {c['stanceFraction']}" if dist else '') + ')', fill=(240, 240, 240))
    for k in range(n):
        p = k / n; f = int(round(p * frames))
        scene.frame_set(f)
        trav = Vector((dvec[0], dvec[1], 0)) * (p * L) if dist else Vector((0, 0, 0))
        rig.location = trav
        bpy.context.view_layer.update()
        center = Vector((trav.x, trav.y, .92))
        aim_cam(cams['side'], center, center + Vector((6, 0, 1.6)))
        aim_cam(cams['front'], center, center + Vector((0, -6, 1.0)))
        for row, key in enumerate(['side', 'front']):
            scene.camera = cams[key]; path = f'{out}/_{name}_{key}_{k}.png'; scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            sheet.paste(Image.open(path).convert('RGB'), (240 * k, 24 + 330 * row)); os.remove(path)
        draw.text((240 * k + 6, 28), f'p={p:.2f}', fill=(20, 20, 20))
    sheet.save(f'{out}/{name}.png')
    print('wrote', f'{out}/{name}.png')
