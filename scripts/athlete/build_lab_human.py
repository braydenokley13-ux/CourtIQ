"""Build a CC0 anatomical player on the existing CC0 Quaternius rig.
Run with Blender 4.3: blender -b -t 2 --python scripts/athlete/build_lab_human.py
Bundled CC0 MakeHuman source; output keeps source rig transforms
byte-for-byte: Blender is used only for geometry normals and weight transfer.
"""
import bpy, json, struct, math, os
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
SOURCE=ROOT+'/apps/web/public/athlete/mannequin.glb'
OUTPUT=ROOT+'/apps/web/public/athlete/lab-human.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
donor=bpy.data.objects['Mannequin_F']
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
rig.data.pose_position='REST'
verts=[];faces=[];groups={};group=''
for line in open(ROOT+'/scripts/athlete/source/makehuman-base.obj'):
 if line.startswith('v '):verts.append(Vector(map(float,line.split()[1:4])))
 elif line.startswith('g '):group=line.strip()[2:];groups[group]=set()
 elif line.startswith('f '):
  face=[int(t.split('/')[0])-1 for t in line.split()[1:]]
  groups[group].update(face)
  if group=='body':faces.append(face)
SCALE=1.808/(8.4913+8.1676)
def mh(v):return Vector((v.x*SCALE,-v.z*SCALE,(v.y+8.1676)*SCALE))
def joint(name):return mh(sum((verts[i] for i in groups['joint-'+name]),Vector())/len(groups['joint-'+name]))
def remap_arm(p,side):
 sign=1 if side=='l' else -1
 shoulder=joint(side+'-shoulder');elbow=joint(side+'-elbow');hand=joint(side+'-hand')
 targetS=rig.data.bones['upperarm_'+side].head_local
 targetE=rig.data.bones['lowerarm_'+side].head_local
 targetH=rig.data.bones['hand_'+side].head_local
 def warp(a,b,c,d):
  rot=(b-a).rotation_difference(d-c)
  vec=p-a
  axis=(b-a).normalized();along=vec.dot(axis)
  vec+=axis*along*((d-c).length/(b-a).length-1)
  return c+rot@vec
 # Smooth elbow seam. The donor's preserved skin weights perform all animation.
 t=(p-elbow).dot((hand-shoulder).normalized())
 blend=max(0,min(1,(t+.04)/.08))
 return warp(shoulder,elbow,targetS,targetE).lerp(warp(elbow,hand,targetE,targetH),blend)
newverts=[];indices=sorted(groups['body']);lookup={i:j for j,i in enumerate(indices)}
for i in indices:
 p=mh(verts[i]);x=abs(p.x)
 # Arms are brought from MakeHuman A-pose to this audited T-pose donor.
 if p.z>1.00 and (x>.24 or p.z>1.30 and x>.165):
  arm=remap_arm(p,'l' if p.x>0 else 'r')
  blend=max(0,min(1,(x-.165)/.05));p=p.lerp(arm,blend)
 # Narrow the A-stance into the rig's bind stance without altering the face.
 if p.z<.92:
  factor=.42+.58*max(0,min(1,(p.z-.15)/.77))
  p.x*=factor
 if .7<p.z<1.10 and abs(p.x)<.24:
  blend=min(1,(p.z-.7)/.12,(1.10-p.z)/.12)
  p.x*=1-.17*max(0,blend)
 # Loose practice jersey: erase chest contour, add hem and cloth allowance.
 if .97<p.z<1.39 and abs(p.x)<.19:
  if p.y<-.045:p.y=max(p.y,-.105)
  p.x*=1.055
 newverts.append(p)
mesh=bpy.data.meshes.new('Anatomical athlete');mesh.from_pydata(newverts,[],[[lookup[i] for i in f] for f in faces]);mesh.update()
obj=bpy.data.objects.new('Anatomical athlete',mesh);bpy.context.collection.objects.link(obj)
for vg in donor.vertex_groups:obj.vertex_groups.new(name=vg.name)
bpy.context.view_layer.objects.active=obj;obj.select_set(True);donor.select_set(False)
mod=obj.modifiers.new('Retarget existing rig weights','DATA_TRANSFER');mod.object=donor;mod.use_vert_data=True;mod.data_types_verts={'VGROUP_WEIGHTS'};mod.vert_mapping='POLYINTERP_NEAREST'
bpy.ops.object.modifier_apply(modifier=mod.name)
# Exact original glTF hierarchy is retained. Only mesh data is replaced.
raw=open(SOURCE,'rb').read();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);offset=20+jl;bl=struct.unpack_from('<I',raw,offset)[0];binary=bytearray(raw[offset+8:offset+8+bl])
skin=doc['skins'][0];boneIndices={doc['nodes'][node]['name']:i for i,node in enumerate(skin['joints'])}
positions=[];normals=[];joints=[];weights=[]
mesh.calc_loop_triangles()
for v in mesh.vertices:
 positions.extend((v.co.x,v.co.z,-v.co.y));normals.extend((v.normal.x,v.normal.z,-v.normal.y))
 influences=sorted([(g.weight,boneIndices[obj.vertex_groups[g.group].name]) for g in v.groups if obj.vertex_groups[g.group].name in boneIndices],reverse=True)[:4]
 if not influences:influences=[(1,boneIndices['pelvis'])]
 total=sum(w for w,j in influences)
 while len(influences)<4:influences.append((0,0))
 joints.extend(j for w,j in influences);weights.extend(w/total for w,j in influences)
triangles=[i for t in mesh.loop_triangles for i in t.vertices]
def accessor(values,fmt,component,kind,count,minmax=False):
 while len(binary)%4:binary.append(0)
 start=len(binary);binary.extend(struct.pack('<'+str(len(values))+fmt,*values));vi=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start})
 item={'bufferView':vi,'componentType':component,'count':count,'type':kind}
 if minmax:item.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
 ai=len(doc['accessors']);doc['accessors'].append(item);return ai
attrs={'POSITION':accessor(positions,'f',5126,'VEC3',len(mesh.vertices),True),'NORMAL':accessor(normals,'f',5126,'VEC3',len(mesh.vertices)),'JOINTS_0':accessor(joints,'H',5123,'VEC4',len(mesh.vertices)),'WEIGHTS_0':accessor(weights,'f',5126,'VEC4',len(mesh.vertices))}
primitive={'attributes':attrs,'indices':accessor(triangles,'I',5125,'SCALAR',len(triangles)),'material':0,'mode':4}
meshIndex=next(doc['nodes'][i]['mesh'] for i in range(len(doc['nodes'])) if 'skin' in doc['nodes'][i])
doc['meshes'][meshIndex]['primitives']=[primitive]
# Remove the replaced mannequin's unused accessor data from the shipping asset.
used=set([skin['inverseBindMatrices']])
for m in doc['meshes']:
 for p in m['primitives']:
  used.update(p['attributes'].values());used.add(p['indices'])
remap={old:new for new,old in enumerate(sorted(used))}
compact=bytearray();views=[];accessors=[]
for old in sorted(used):
 a=dict(doc['accessors'][old]);view=doc['bufferViews'][a['bufferView']]
 while len(compact)%4:compact.append(0)
 start=len(compact);offset=view.get('byteOffset',0);compact.extend(binary[offset:offset+view['byteLength']])
 newview=dict(view);newview['byteOffset']=start;newview['buffer']=0
 a['bufferView']=len(views);views.append(newview);accessors.append(a)
for m in doc['meshes']:
 for p in m['primitives']:
  p['attributes']={k:remap[v] for k,v in p['attributes'].items()};p['indices']=remap[p['indices']]
for s in doc['skins']:s['inverseBindMatrices']=remap[s['inverseBindMatrices']]
binary=compact;doc['accessors']=accessors;doc['bufferViews']=views
doc['buffers'][0]['byteLength']=len(binary)
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);binary.extend(b'\x00'*((-len(binary))%4))
with open(OUTPUT,'wb') as f:f.write(struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary)));f.write(struct.pack('<II',len(encoded),0x4e4f534a));f.write(encoded);f.write(struct.pack('<II',len(binary),0x004e4942));f.write(binary)
print('BUILT',OUTPUT,len(mesh.vertices),'vertices',len(triangles)//3,'triangles',os.path.getsize(OUTPUT),'bytes')
# Isolated artifact for QA; not used at runtime.
obj.parent=rig
arm=obj.modifiers.new('Rig','ARMATURE');arm.object=rig
for o in list(bpy.data.objects):
 if o.type=='MESH' and o!=obj:bpy.data.objects.remove(o,do_unlink=True)
bpy.ops.wm.save_as_mainfile(filepath='/tmp/courtiq-lab-human.blend')
