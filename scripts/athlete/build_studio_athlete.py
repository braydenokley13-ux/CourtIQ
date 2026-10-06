"""CourtIQ basketball athlete DCC production build (Blender 4.3+).

blender -b -t 2 --python scripts/athlete/build_studio_athlete.py
Consumes the CC0 anatomical bind mesh built by build_lab_human.py. Authors uniform,
footwear, materials, deterministic in-place basketball action library and mesh LODs.
Everything in this file is locally authored, not downloaded motion capture.
"""
import bpy, math, os, json
from mathutils import Vector, Matrix, Quaternion
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../..'))
OUT=ROOT+'/apps/web/public/athlete'
SOURCE=OUT+'/lab-human.glb'
TAU=math.pi*2
FPS=24
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
body=bpy.data.objects['Mannequin_F'];body.name='LOD0_body'
for o in list(bpy.data.objects):
 if o.type=='MESH' and o!=body:bpy.data.objects.remove(o,do_unlink=True)
rig.name='CourtIQ_basketball_rig'
rig.data.pose_position='REST'

def material(name,color,roughness=.75):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=roughness
 return m
skin=material('athlete_skin',(.43,.235,.135),.7)
kit=material('athlete_kit',(.018,.13,.135),.84)
trim=material('athlete_trim',(.80,.82,.70),.76)
shoe=material('athlete_shoe',(.055,.075,.068),.57)
sole=material('athlete_sole',(.70,.73,.67),.80)
hair=material('athlete_hair',(.018,.021,.018),.94)
eye=material('athlete_eye',(.24,.16,.095),.5)
body.data.materials.clear()
for m in [skin,hair]:body.data.materials.append(m)
# Closed scalp with a clean short haircut. No expressionless white eyeballs.
for p in body.data.polygons:
 c=p.center
 if c.z>1.742 or (c.z>1.69 and c.y>-.035):p.material_index=1
 p.use_smooth=True
# Give the upper back/shoulders an athletic silhouette without changing joint lengths.
for v in body.data.vertices:
 z=v.co.z
 if 1.18<z<1.53 and abs(v.co.x)<.25:
  v.co.x*=1+.07*math.sin(math.pi*(z-1.18)/.35)
# Shorter, restrained fingers read as a relaxed hand at court camera distance.
for v in body.data.vertices:
 if abs(v.co.x)>.65:
  sign=1 if v.co.x>0 else -1;v.co.x=sign*(.645+(abs(v.co.x)-.645)*.82)
# Hidden body triangles are cut before LOD generation (no skin/uniform intersection).
import bmesh
bm=bmesh.new();bm.from_mesh(body.data)
remove=[]
for f in bm.faces:
 c=f.calc_center_median();x,y,z=c
 torso=.975<z<1.525 and abs(x)<.197
 if z>1.445 and (x/.083)**2+((y+.020)/.105)**2<1.05:torso=False
 shorts=.55<z<1.04 and max(v.co.z for v in f.verts)>.588 and min(v.co.z for v in f.verts)<1.008 and abs(x)<.265
 feet=z<.122
 if torso or shorts or feet:remove.append(f)
bmesh.ops.delete(bm,geom=remove,context='FACES');bm.to_mesh(body.data);bm.free();body.data.update()
# The anatomical source is dense around the face. Preserve it at court distance with
# a modest collapse pass while the tactical LOD spends fewer triangles on anatomy.
bpy.context.view_layer.objects.active=body;body.select_set(True)
mod=body.modifiers.new('Production body reduction','DECIMATE');mod.ratio=.65
bpy.ops.object.modifier_apply(modifier=mod.name)

pieces=[]
def mesh_object(name,verts,faces,materials,indices=None,weights=None):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
 ob=bpy.data.objects.new('LOD0_'+name,me);bpy.context.collection.objects.link(ob)
 for m in materials:me.materials.append(m)
 for p in me.polygons:
  p.use_smooth=True
  if indices:p.material_index=indices[p.index]
 if weights:
  names=set(n for influences in weights for n,w in influences)
  for n in names:ob.vertex_groups.new(name=n)
  for i,influences in enumerate(weights):
   for n,w in influences:ob.vertex_groups[n].add([i],w,'REPLACE')
 else:
  for vg in body.vertex_groups:ob.vertex_groups.new(name=vg.name)
  bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob
  tr=ob.modifiers.new('Anatomical cloth skin weights','DATA_TRANSFER');tr.object=body;tr.use_vert_data=True;tr.data_types_verts={'VGROUP_WEIGHTS'};tr.vert_mapping='POLYINTERP_NEAREST'
  bpy.ops.object.modifier_apply(modifier=tr.name)
 ob.parent=rig;arm=ob.modifiers.new('Basketball deformation','ARMATURE');arm.object=rig
 pieces.append(ob);return ob

def torso_weights(z):
 if z<1.07:return [('pelvis',.45),('spine_01',.55)]
 if z<1.22:return [('spine_01',.35),('spine_02',.65)]
 return [('spine_02',.3),('spine_03',.7)]
# A sewn sleeveless vest, with a loose waist, flat front/back shoulder panels,
# fitted arm entries and a clean crew-neck yoke. Covered anatomical faces are removed
# above to prevent the principal skin/garment intersections in authored poses.
verts=[];faces=[];mi=[];weights=[];N=40
rings=[(.974,.179,.116),(1.002,.181,.118),(1.12,.175,.126),(1.29,.193,.137),(1.385,.195,.145),(1.505,.193,.145)]
for k,(z,rx,ry) in enumerate(rings):
 for i in range(N):
  a=TAU*i/N;fold=.0016*math.sin(a*8+k*.8)*(1 if k<3 else .2)
  z1=z-(.070*abs(math.sin(a)) if k==5 else 0)
  verts.append((rx*math.cos(a)+math.cos(a)*fold,ry*math.sin(a)+.008+math.sin(a)*fold,z1))
  if k>=4 and abs(math.cos(a))>.72:
   upper=.32 if k==5 else .16;weights.append([('spine_03',1-upper),('upperarm_'+('l' if math.cos(a)>0 else 'r'),upper)])
  else:weights.append(torso_weights(z1))
for k in range(len(rings)-1):
 for i in range(N):
  a=TAU*(i+.5)/N
  faces.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i));mi.append(1 if k==0 else 0)
inner_start=len(verts)
for i in range(N):
 a=TAU*i/N;z=1.495-.035*max(0,-math.sin(a))
 verts.append((.083*math.cos(a),-.020+.105*math.sin(a),z));weights.append(torso_weights(z))
for i in range(N):
 faces.append((5*N+i,5*N+(i+1)%N,inner_start+(i+1)%N,inner_start+i));mi.append(0)
mesh_object('jersey',verts,faces,[kit,trim],mi,weights)
# Narrow contrast binding around the crew neck, authored on the same skin weights.
v=[];f=[];w=[]
for i in range(N):
 a=TAU*i/N;z=1.495-.035*max(0,-math.sin(a))
 for width in [0,.006]:v.append(((.083+width)*math.cos(a),-.020+(.105+width)*math.sin(a),z+.001));w.append(torso_weights(z))
for i in range(N):f.append((i*2,((i+1)%N)*2,((i+1)%N)*2+1,i*2+1))
mesh_object('neck_binding',v,f,[trim],weights=w)
# Basketball shorts have a shared tailored waist and two wide, separated leg hems.
verts=[];faces=[];mi=[];weights=[]
for sign in [-1,1]:
 start=len(verts);n=24
 levels=[(.592,.110,.131,sign*.108),(.616,.112,.134,sign*.108),(.76,.126,.145,sign*.105),(.90,.126,.139,sign*.095),(.997,.116,.126,sign*.079)]
 for k,(z,rx,ry,cx) in enumerate(levels):
  for i in range(n):
   a=TAU*i/n;x=cx+rx*math.cos(a);y=.014+ry*math.sin(a)
   # Joining inner legs stays close to the body's crotch instead of intersecting.
   if sign*x<.012:x=sign*.012
   fold=.002*math.sin(a*6+k)
   verts.append((x,y+fold,z))
   pelvis=max(0,min(1,(z-.72)/.25));weights.append([('pelvis',pelvis),('thigh_'+('l' if sign>0 else 'r'),1-pelvis)])
 for k in range(len(levels)-1):
  for i in range(n):
   faces.append((start+k*n+i,start+k*n+(i+1)%n,start+(k+1)*n+(i+1)%n,start+(k+1)*n+i))
   a=TAU*(i+.5)/n;mi.append(1 if k==0 or abs(math.cos(a))>.972 and sign*math.cos(a)>0 else 0)
mesh_object('shorts',verts,faces,[kit,trim],mi,weights)
# Narrow waistband bridges the two legs cleanly.
verts=[];faces=[];weights=[]
for z in [.972,1.006]:
 for i in range(48):
  a=TAU*i/48;verts.append((.197*math.cos(a),.015+.13*math.sin(a),z));weights.append([('pelvis',1)])
for i in range(48):faces.append((i,(i+1)%48,(i+1)%48+48,i+48))
mesh_object('waistband',verts,faces,[trim],weights=weights)
# Lasted shoe shape: heel counter, raised instep, wide forefoot, flatter toe box.
# Sculpted rings are an actual reusable shoe asset, not runtime capsules.
for sign in [-1,1]:
 side='l' if sign>0 else 'r';cx=sign*.089;verts=[];faces=[];weights=[];mi=[];N=20
 profiles=[(.017,.068,.146,-.035),(.039,.071,.149,-.035),(.058,.070,.144,-.036),(.091,.056,.125,-.026),(.132,.043,.065,.022),(.147,.041,.054,.028)]
 for z,rx,ry,cy in profiles:
  z=.017+(z-.017)*.88;rx*=.90;ry*=.90
  for i in range(N):
   a=TAU*i/N
   # Squared oval toe/heel avoids a balloon sole silhouette.
   x=math.copysign(abs(math.cos(a))**.78,math.cos(a))*rx
   y=math.copysign(abs(math.sin(a))**.84,math.sin(a))*ry
   verts.append((cx+x,cy+y,z));weights.append([('foot_'+side,1)])
 for k in range(len(profiles)-1):
  for i in range(N):
   faces.append((k*N+i,k*N+(i+1)%N,(k+1)*N+(i+1)%N,(k+1)*N+i));mi.append(1 if k==0 else 0)
 faces.append(tuple(reversed(range(N))));mi.append(1)
 faces.append(tuple((len(profiles)-1)*N+i for i in range(N)));mi.append(0)
 mesh_object('shoe_'+side,verts,faces,[shoe,sole],mi,weights)
 # Small lace bands and contrasting quarter-panel inset, authored in asset space.
 lv=[];lf=[];lw=[]
 for k in range(4):
  y=-.079+k*.021;z=.017+(.105+k*.004-.017)*.88;width=(.035-k*.003)*.90;start=len(lv)
  lv.extend([(cx-width,y-.003,z),(cx+width,y-.003,z),(cx+width,y+.003,z),(cx-width,y+.003,z)])
  lf.append(tuple(start+i for i in range(4)));lw.extend([[('foot_'+side,1)]]*4)
 mesh_object('shoe_laces_'+side,lv,lf,[sole],weights=lw)
 # Ribbed low sock follows the ankle, fully weighted to the foot.
 sv=[];sf=[];sw=[]
 for z in [.132,.183,.195]:
  for i in range(20):
   a=TAU*i/20;sv.append((cx+.041*math.cos(a),.027+.052*math.sin(a),z));sw.append([('foot_'+side,1)])
 for k in range(2):
  for i in range(20):sf.append((k*20+i,k*20+(i+1)%20,(k+1)*20+(i+1)%20,(k+1)*20+i))
 mesh_object('sock_'+side,sv,sf,[trim],weights=sw)
# Small inset eyes, sized for stylized realism instead of white cartoon marbles.
for sign in [-1,1]:
 bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=1,location=(sign*.0334,-.136,1.676))
 ob=bpy.context.object;ob.name='LOD0_eye_'+str(sign);ob.scale=(.008,.006,.0045)
 bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 ob.data.materials.append(eye)
 vg=ob.vertex_groups.new(name='Head');vg.add(list(range(len(ob.data.vertices))),1,'REPLACE')
 # Apply location so the armature deforms vertices in the same coordinate system.
 bpy.ops.object.transform_apply(location=True,rotation=False,scale=False)
 ob.parent=rig;ar=ob.modifiers.new('Rig','ARMATURE');ar.object=rig;pieces.append(ob)
# Merge mesh objects into material groups; glTF emits 7 material primitives, while
# every piece shares one palette and one rig. Joining also makes teardown simple.
bpy.ops.object.select_all(action='DESELECT')
for ob in [body]+pieces:ob.select_set(True)
bpy.context.view_layer.objects.active=body;bpy.ops.object.join();body.name='LOD0_athlete'
# Normalize top four influences for predictable WebGL skinning and glTF export.
for v in body.data.vertices:
 weights0=sorted([(g.weight,g.group) for g in v.groups if g.weight>.0001],reverse=True)[:4];total=sum(w for w,g in weights0)
 for g in list(v.groups):body.vertex_groups[g.group].remove([v.index])
 if total:
  for w,g in weights0:body.vertex_groups[g].add([v.index],w/total,'REPLACE')
# Tactical LOD is derived in DCC; collapse fingers/face geometry and small folds.
lod=body.copy();lod.data=body.data.copy();bpy.context.collection.objects.link(lod);lod.name='LOD1_athlete'
bpy.ops.object.select_all(action='DESELECT');lod.select_set(True);bpy.context.view_layer.objects.active=lod
mod=lod.modifiers.new('Tactical mesh reduction','DECIMATE');mod.ratio=.33;mod.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier=mod.name)
# Finger weights on the tactical mesh use the hand. This allows runtime animation
# evaluation to omit finger tracks without changing the expressive court silhouette.
for v in lod.data.vertices:
 remap={}
 for g in list(v.groups):
  n=lod.vertex_groups[g.group].name
  if any(s in n for s in ['thumb','index','middle','ring','pinky']):n='hand_'+n[-1]
  remap[n]=remap.get(n,0)+g.weight
 for g in list(v.groups):lod.vertex_groups[g.group].remove([v.index])
 total=sum(remap.values())
 for n,w in remap.items():lod.vertex_groups[n].add([v.index],w/total,'REPLACE')
lod.hide_render=True

# DCC animation stage. Controls are solved in armature space, baked to local TRS,
# then exported as ordinary reusable glTF actions. The court owns all root motion.
rig.data.pose_position='POSE';bones=rig.pose.bones
REST={b.name:b.matrix.copy() for b in bones}
REST_FOOT={s:REST['foot_'+s].to_quaternion() for s in ['l','r']}
REST_PELVIS=REST['pelvis'].translation.copy()
KEY_BONES=['pelvis','spine_01','spine_02','spine_03','neck_01','Head','clavicle_l','clavicle_r','upperarm_l','upperarm_r','lowerarm_l','lowerarm_r','hand_l','hand_r','thigh_l','thigh_r','calf_l','calf_r','foot_l','foot_r','ball_l','ball_r']
for b in bones:b.rotation_mode='QUATERNION'

def update():bpy.context.view_layer.update()
def reset():
 for b in bones:b.matrix_basis=Matrix.Identity(4)
 update()
def aim(name,child,target):
 b=bones[name];origin=b.matrix.translation.copy();current=bones[child].matrix.translation-origin;desired=Vector(target)-origin
 if current.length<1e-6 or desired.length<1e-6:return
 delta=current.rotation_difference(desired)
 loc,rot,scale=b.matrix.decompose();b.matrix=Matrix.LocRotScale(loc,delta@rot,scale);update()
def two_bone(a,b,c,target,pole):
 origin=bones[a].matrix.translation.copy();middle=bones[b].matrix.translation.copy();end=bones[c].matrix.translation.copy()
 l1=(middle-origin).length;l2=(end-middle).length;axis=Vector(target)-origin;distance=max(.025,min(axis.length,l1+l2-.006));axis.normalize()
 along=(l1*l1-l2*l2+distance*distance)/(2*distance)
 bend=Vector(pole)-origin;perp=bend-axis*bend.dot(axis)
 if perp.length<.0001:perp=Vector((0,-1,0))
 perp.normalize();knee=origin+axis*along+perp*math.sqrt(max(.0001,l1*l1-along*along))
 aim(a,b,knee);aim(b,c,origin+axis*distance)
def orient(name,quat):
 b=bones[name];loc,rot,scale=b.matrix.decompose();b.matrix=Matrix.LocRotScale(loc,quat,scale);update()
def rot_world(name,axis,angle):
 b=bones[name];loc,rot,scale=b.matrix.decompose();b.matrix=Matrix.LocRotScale(loc,Quaternion(axis,angle)@rot,scale);update()

def pose(kind,t,duration):
 reset();phase=t/duration;cycle=TAU*phase;defensive=kind in ['defense_ready','defense_slide_left','defense_slide_right','closeout']
 moving=kind in ['cut_run','defense_slide_left','defense_slide_right','start_stop']
 pelvis_drop=.145 if defensive else .065
 spread=.245 if defensive else .15
 if kind=='screen_plant':pelvis_drop=.105;spread=.215
 if kind=='pivot':pelvis_drop=.10;spread=.18
 if kind=='start_stop':pelvis_drop=.065+.045*(.5-.5*math.cos(cycle))
 breathe=.005*math.sin(cycle)
 pelvis=bones['pelvis'];pelvis.matrix.translation=REST_PELVIS+Vector((.008*math.sin(cycle) if not moving else 0,.012,pelvis_drop*-1+breathe));update()
 lean=.13 if kind=='cut_run' else .08 if defensive else .035
 rot_world('spine_01',(1,0,0),lean)
 rot_world('spine_03',(0,0,1),.06*math.sin(cycle) if kind=='cut_run' else .015*math.sin(cycle))
 if kind=='pivot':rot_world('pelvis',(0,0,1),.38*math.sin(cycle));rot_world('spine_03',(0,0,1),.15*math.sin(cycle))
 # Contact curves contain a real planted interval. A planted foot travels opposite
 # root velocity; recovery returns through a low arc. No generic sine-leg posing.
 for s,sign in [('l',1),('r',-1)]:
  p=(phase+(0 if sign>0 else .5))%1;footx=sign*spread;footy=.027;lift=0
  if kind=='cut_run' or kind=='start_stop':
   stance=.60;stride=.44 if kind=='cut_run' else .26
   if p<stance:footy+=-stride/2+stride*p/stance
   else:
    u=(p-stance)/(1-stance);footy+=stride/2-stride*(u*u*(3-2*u));lift=.11*math.sin(math.pi*u)
  if kind.startswith('defense_slide'):
   direction=1 if kind.endswith('left') else -1;stance=.64;stride=.42
   if p<stance:footx+=direction*(stride/2-stride*p/stance)
   else:
    u=(p-stance)/(1-stance);footx+=direction*(-stride/2+stride*(u*u*(3-2*u)));lift=.045*math.sin(math.pi*u)
  if kind=='pivot' and s=='r':footy+=.15*math.sin(cycle);lift=.025*abs(math.sin(cycle))
  target=(footx,footy,.1037+lift)
  two_bone('thigh_'+s,'calf_'+s,'foot_'+s,target,(sign*.19,-.32,.52))
  foot_rot=REST_FOOT[s]
  if lift>0:foot_rot=Quaternion((1,0,0),-.12*lift/.11)@foot_rot
  orient('foot_'+s,foot_rot)
  # Ready hands present distinct intent: wide denial, protected screen, offered
  # catch target, pass extension, or one high hand with short closeout steps.
  hx=sign*(.40 if defensive else .225);hy=-.20 if defensive else -.23;hz=(1.18+sign*.016*math.sin(cycle)) if defensive else 1.12
  pole=(sign*.43,.055,1.10)
  if kind=='cut_run' or kind=='start_stop':
   hx=sign*.235;hy=-.10-sign*.14*math.sin(cycle);hz=1.03+sign*.075*math.sin(cycle);pole=(sign*.32,.10+sign*.10*math.sin(cycle),1.00)
  if kind=='screen_plant':hx=sign*.095;hy=-.205;hz=1.03;pole=(sign*.30,.01,1.06)
  if kind=='receive':hx=sign*.145;hy=-.38+.05*math.sin(cycle);hz=1.15;pole=(sign*.34,-.02,1.13)
  if kind=='chest_pass':
   extension=.5-.5*math.cos(cycle);hx=sign*(.12+.02*extension);hy=-.22-.32*extension;hz=1.17+.08*extension;pole=(sign*.37,-.06,1.12)
  if kind=='shot_release':
   extension=.5-.5*math.cos(cycle);hx=sign*(.10-.04*extension);hy=-.20-.025*extension;hz=1.52+.27*extension;pole=(sign*.21,-.09,1.48)
  if kind=='dribble':
   if s=='r':hx=-.32;hy=-.29;hz=.84+.18*(.5+.5*math.cos(cycle));pole=(-.34,.04,1.08)
   else:hx=.31;hy=-.23;hz=1.10
  if kind=='closeout':
   if s=='l':hx=.24;hy=-.18;hz=1.72+.025*math.sin(cycle);pole=(.42,-.02,1.49)
   else:hx=-.43;hy=-.25;hz=1.14
  if kind=='pivot':hx=sign*.18;hy=-.29;hz=1.09
  two_bone('upperarm_'+s,'lowerarm_'+s,'hand_'+s,(hx,hy,hz),pole)
 # Head counters torso roll and scans the possession with a quiet, authored look.
 rot_world('Head',(0,0,1),.05*math.sin(cycle+.4))
 # Relaxed fingers rather than a rigid T-pose fan; uniform hand curl is recorded.
 for b in bones:
  if any(n in b.name for n in ['index_','middle_','ring_','pinky_']) and not b.name.endswith('_end'):
   b.rotation_quaternion=Quaternion((1,0,0),.11 if kind=='receive' else .19)
 update()

specs=[('offense_ready',2.4),('defense_ready',2.4),('defense_slide_left',.8),('defense_slide_right',.8),('cut_run',.72),('start_stop',1.0),('screen_plant',2.0),('pivot',1.4),('receive',1.0),('chest_pass',.8),('shot_release',1.0),('dribble',.8),('closeout',1.0)]
rig.animation_data_create();metrics=[]
for name,duration in specs:
 action=bpy.data.actions.new(name);action.use_fake_user=True;rig.animation_data.action=action
 frames=round(duration*FPS);actual=frames/FPS
 minimum=10;maximum=-10
 for f in range(frames+1):
  bpy.context.scene.frame_set(f);pose(name,f/FPS,actual)
  for key in KEY_BONES:
   b=bones[key];b.keyframe_insert(data_path='location',frame=f,group=key);b.keyframe_insert(data_path='rotation_quaternion',frame=f,group=key)
  for s in ['l','r']:
   z=bones['foot_'+s].matrix.translation.z;minimum=min(minimum,z);maximum=max(maximum,z)
 for curve in action.fcurves:
  for k in curve.keyframe_points:k.interpolation='LINEAR'
 metrics.append({'name':name,'duration':actual,'frames':frames+1,'ankleHeightMin':round(minimum,4),'ankleHeightMax':round(maximum,4),'rootMotion':False})
rig.animation_data.action=None;reset();bpy.context.scene.render.fps=FPS
# Keep production source editable: meshes, palette, rig and all reusable actions.
sourcepath=ROOT+'/scripts/athlete/source/lab-athlete-studio.blend'
bpy.ops.wm.save_as_mainfile(filepath=sourcepath,compress=True)
# Main optimized asset contains the two meshes on ONE skeleton, so switching LOD
# never doubles animation mixers or skeleton updates. Source remains in the blend.
bpy.ops.object.select_all(action='DESELECT')
for ob in [rig,body,lod]:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
kwargs=dict(export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_frame_range=False,export_optimize_animation_size=True,export_skins=True,export_def_bones=True,export_yup=True,export_extras=True)
bpy.ops.export_scene.gltf(filepath=OUT+'/lab-athlete.glb',**kwargs)
body.select_set(False)
bpy.ops.export_scene.gltf(filepath=OUT+'/lab-athlete-tactical.glb',**kwargs)
import sys
sys.path.insert(0,os.path.dirname(__file__))
from optimize_studio_glb import optimize
for filename in ['lab-athlete.glb','lab-athlete-tactical.glb']:optimize(OUT+'/'+filename)
# Basic geometry and animation measurements ship as reviewable build evidence.
for ob in [body,lod]:ob.data.calc_loop_triangles()
report={'generator':'Blender '+bpy.app.version_string,'fps':FPS,'heightMeters':1.808,'sourceBlend':'scripts/athlete/source/lab-athlete-studio.blend','lod0':{'vertices':len(body.data.vertices),'triangles':len(body.data.loop_triangles)},'lod1':{'vertices':len(lod.data.vertices),'triangles':len(lod.data.loop_triangles)},'clips':metrics,'bytes':{n:os.path.getsize(OUT+'/'+n) for n in ['lab-athlete.glb','lab-athlete-tactical.glb']}}
with open(OUT+'/lab-athlete-build.json','w') as f:json.dump(report,f,indent=2)
print('COURTIQ_STUDIO_BUILD',json.dumps(report))
