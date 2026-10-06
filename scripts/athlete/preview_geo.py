"""Cycles CPU preview of the athlete geometry with a test atlas.
python3 scripts/athlete/preview_geo.py OUT.png [hair=crop] [lod=0] [pose=none|ready]
Renders a contact sheet: front, 3/4, back, head close-up, torso+hem close-up."""
import bpy, os, sys, math
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
out = sys.argv[1]
opts = dict(a.split('=') for a in sys.argv[2:])
hair = opts.get('hair', 'crop'); lod = opts.get('lod', '0'); skin = opts.get('skin', '#b07a56'); hairc = opts.get('hairc', '#1b1814')
blend = opts.get('blend', ROOT + '/scripts/athlete/source/lab-athlete-geometry.blend')
bpy.ops.wm.open_mainfile(filepath=blend)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
atlas = Image.new('RGB', (512, 512), (128, 128, 128))
d = ImageDraw.Draw(atlas)
sw = {'skin': skin, 'hair': hairc, 'trim': '#e6efe9', 'shorts': '#12363e', 'shoe': '#eceae0', 'sole': '#2d3836', 'eye_white': '#eeeeea', 'feature': '#1a1210', 'lips': '#8b4b3c', 'sock': '#f0f0ea', 'lace': '#dcdcd4', 'skin_shadow': '#a06040', 'hair_hi': '#3a2a1c', 'accent': '#d2672b'}
names = ['skin', 'hair', 'trim', 'shorts', 'shoe', 'sole', 'eye_white', 'feature', 'lips', 'sock', 'lace', 'skin_shadow', 'hair_hi', 'accent']
for i, n in enumerate(names):
    c, r = i % 8, i // 8
    d.rectangle([c*64, r*64, c*64+63, r*64+63], fill=sw[n])
d.rectangle([0, 128, 512, 512], fill='#16414a')
d.rectangle([0, 128, 512, 160], fill='#e6efe9')  # shoulder panel top band (v max)
d.rectangle([0, 480, 512, 512], fill='#e6efe9')  # hem band (canvas bottom)
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 110) if os.path.exists('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf') else None
d.text((128, 300), '7', fill='#f2f5ef', font=f, anchor='mm'); d.text((384, 300), '7', fill='#f2f5ef', font=f, anchor='mm')
for x in (0, 242, 500): d.rectangle([x, 128, x + 14, 512], fill='#e6efe9')
atlas.save('/tmp/claude-0/atlas_test.png')
img = bpy.data.images.load('/tmp/claude-0/atlas_test.png'); img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials['athlete_atlas']; nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.interpolation = 'Closest'
mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs[0].default_value = 1
col = [n for n in nt.nodes if n.bl_idname == 'ShaderNodeVertexColor'][0]
nt.links.new(tex.outputs['Color'], mix.inputs[6]); nt.links.new(col.outputs['Color'], mix.inputs[7]); nt.links.new(mix.outputs[2], bsdf.inputs['Base Color']); uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'; nt.links.new(uvn.outputs['UV'], tex.inputs['Vector']); print('mix inputs', [(i.name,i.type) for i in mix.inputs])
bsdf.inputs['Roughness'].default_value = .55
for ob in bpy.data.objects:
    if ob.type != 'MESH': continue
    show = ob.name == f'LOD{lod}_athlete' or ob.name == 'HAIR_' + hair
    ob.hide_render = not show
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = int(opts.get('samples', 20)); scene.cycles.use_denoising = False; scene.cycles.device = 'CPU'
scene.view_settings.view_transform = 'Standard'
W, H = 480, 600
scene.render.resolution_x, scene.render.resolution_y = W, H
w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .6, .68, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .45
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 1.5; so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (math.radians(55), 0, math.radians(-30))
fill = bpy.data.lights.new('fill', 'SUN'); fill.energy = .5; fo = bpy.data.objects.new('fill', fill); scene.collection.objects.link(fo); fo.rotation_euler = (math.radians(70), 0, math.radians(150))
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, -.001)); fl = bpy.context.object
fm = bpy.data.materials.new('f'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.7, .55, .35, 1); fl.data.materials.append(fm)
pose = opts.get('pose', 'none')
if pose == 'ready':
    sys.path.insert(0, ROOT + '/scripts/athlete')
    import motion_lib
    R = motion_lib.Rig(rig); motion_lib.apply_pose(R, motion_lib.pose_defense_ready(0.5, 2.0)); bpy.context.view_layer.update()
def cam(name, eye, target, ortho=None, fov=None):
    cd = bpy.data.cameras.new(name)
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.lens = fov or 60
    o = bpy.data.objects.new(name, cd); scene.collection.objects.link(o)
    o.location = eye; o.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler(); return o
views = {
 'front': cam('c1', (0, -6, 1.1), (0, 0, .95), ortho=2.3 if pose == 'none' else 2.1),
 'side': cam('c2', (6, 0, 1.1), (0, 0, .95), ortho=2.3 if pose == 'none' else 2.1),
 'back': cam('c3', (0, 6, 1.1), (0, 0, .95), ortho=2.3 if pose == 'none' else 2.1),
 'head': cam('c4', (1.2, -1.6, 1.75), (0, -.04, 1.69), fov=85),
 'head_side': cam('c5', (1.6, -.2, 1.74), (0, -.04, 1.70), ortho=.42),
 'torso': cam('c6', (-1.4, -1.9, 1.55), (0, 0, 1.2), fov=55),
}
keys = opts.get('views', 'front,side,back,head,head_side,torso').split(',')
sheet = Image.new('RGB', (W * len(keys), H))
for i, k in enumerate(keys):
    scene.camera = views[k]; scene.render.filepath = f'/tmp/claude-0/_v_{k}.png'; bpy.ops.render.render(write_still=True)
    sheet.paste(Image.open(scene.render.filepath).convert('RGB'), (W * i, 0))
sheet.save(out)
print('wrote', out)
