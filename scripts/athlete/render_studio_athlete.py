"""CPU Cycles contact sheet source renders; no browser/GPU context required.
blender -b -t 2 --python scripts/athlete/render_studio_athlete.py
"""
import bpy,os
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
bpy.ops.wm.open_mainfile(filepath=ROOT+'/scripts/athlete/source/lab-athlete-studio.blend')
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for ob in bpy.data.objects:
 if ob.name.startswith('LOD1'):ob.hide_render=True
mat=bpy.data.materials.new('QA_floor');mat.diffuse_color=(.78,.77,.70,1)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.006));bpy.context.object.data.materials.append(mat)
world=bpy.data.worlds.new('Studio');bpy.context.scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.36,.40,1);world.node_tree.nodes['Background'].inputs[1].default_value=.55
for name,location,energy,size in [('Large studio key',(3,-4,5),450,4),('Soft rim',(-2,2,3.5),350,3),('Front fill',(-3,-3,2),130,3)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o);o.location=location;o.rotation_euler=(Vector((0,0,.9))-o.location).to_track_quat('-Z','Y').to_euler()
data=bpy.data.cameras.new('QA_camera');cam=bpy.data.objects.new('QA_camera',data);bpy.context.collection.objects.link(cam);bpy.context.scene.camera=cam;cam.location=(2.8,-5.0,2.65);cam.rotation_euler=(Vector((0,0,.91))-cam.location).to_track_quat('-Z','Y').to_euler();data.type='ORTHO';data.ortho_scale=2.15
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=False;scene.render.resolution_x=500;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG';os.makedirs('/tmp/courtiq-athlete-studio',exist_ok=True)
poses=[('defense_ready',0),('defense_slide_left',6),('cut_run',4),('screen_plant',0),('chest_pass',9),('closeout',0)]
if os.environ.get('COURTIQ_QUICK')=='1':poses=poses[:1];scene.cycles.samples=16
for name,f in poses:
 rig.animation_data.action=bpy.data.actions[name];scene.frame_set(f);bpy.context.view_layer.update();scene.render.filepath='/tmp/courtiq-athlete-studio/'+name+'.png';bpy.ops.render.render(write_still=True)
