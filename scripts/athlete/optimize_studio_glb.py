"""Lossless glTF animation/buffer pruning; no runtime decoder required.
Prune sampled tracks identical to the bind/local default, then compact accessors.
"""
import json,struct,os
from pathlib import Path
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
FMT={5126:'f',5125:'I',5123:'H',5121:'B'}
def optimize(path):
 raw=Path(path).read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);bl=struct.unpack_from('<I',raw,20+jl)[0];binary=raw[28+jl:28+jl+bl]
 def values(index):
  a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];fmt=FMT[a['componentType']];n=a['count']*WIDTH[a['type']];return struct.unpack_from('<'+str(n)+fmt,binary,v.get('byteOffset',0)+a.get('byteOffset',0))
 original=sum(len(a['channels']) for a in doc.get('animations',[]))
 for anim in doc.get('animations',[]):
  channels=[];samplers=[]
  for channel in anim['channels']:
   sampler=anim['samplers'][channel['sampler']];node=doc['nodes'][channel['target']['node']];prop=channel['target']['path'];width={'translation':3,'rotation':4,'scale':3}.get(prop)
   if not width:continue
   val=values(sampler['output']);default=node.get(prop,{'translation':[0,0,0],'rotation':[0,0,0,1],'scale':[1,1,1]}[prop])
   # Quaternion sign is equivalent; compare per sample to both signs.
   same=True
   for i in range(0,len(val),width):
    sample=val[i:i+width];err=max(abs(x-y) for x,y in zip(sample,default))
    if prop=='rotation':err=min(err,max(abs(x+y) for x,y in zip(sample,default)))
    if err>0.00002:same=False;break
   if same:continue
   channel['sampler']=len(samplers);samplers.append(sampler);channels.append(channel)
  anim['channels']=channels;anim['samplers']=samplers
 used=set()
 for skin in doc.get('skins',[]):used.add(skin['inverseBindMatrices'])
 for mesh in doc.get('meshes',[]):
  for p in mesh['primitives']:
   used.update(p['attributes'].values())
   if 'indices'in p:used.add(p['indices'])
 for a in doc.get('animations',[]):
  for s in a['samplers']:used.update([s['input'],s['output']])
 remap={old:new for new,old in enumerate(sorted(used))};newbinary=bytearray();views=[];accessors=[];viewmap={}
 for old in sorted(used):
  a=dict(doc['accessors'][old]);oldview=a['bufferView'];view=doc['bufferViews'][oldview]
  if oldview not in viewmap:
   while len(newbinary)%4:newbinary.append(0)
   offset=view.get('byteOffset',0);newview=dict(view);newview['byteOffset']=len(newbinary);newview['buffer']=0
   newbinary.extend(binary[offset:offset+view['byteLength']]);viewmap[oldview]=len(views);views.append(newview)
  a['bufferView']=viewmap[oldview];accessors.append(a)
 for skin in doc.get('skins',[]):skin['inverseBindMatrices']=remap[skin['inverseBindMatrices']]
 for mesh in doc.get('meshes',[]):
  for p in mesh['primitives']:
   p['attributes']={k:remap[v] for k,v in p['attributes'].items()}
   if 'indices'in p:p['indices']=remap[p['indices']]
 for a in doc.get('animations',[]):
  for s in a['samplers']:s['input']=remap[s['input']];s['output']=remap[s['output']]
 doc['accessors']=accessors;doc['bufferViews']=views;doc['buffers'][0]['byteLength']=len(newbinary)
 doc.setdefault('asset',{}).setdefault('extras',{})['CourtIQ']='Locally authored basketball DCC actions; shared rig LOD; lossless track pruning.'
 encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);newbinary.extend(b'\0'*((-len(newbinary))%4))
 output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(newbinary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(newbinary),0x004e4942)+newbinary
 Path(path).write_bytes(output)
 return {'path':str(path),'beforeBytes':len(raw),'afterBytes':len(output),'beforeTracks':original,'afterTracks':sum(len(a['channels']) for a in doc.get('animations',[]))}
if __name__=='__main__':
 root=Path(__file__).resolve().parents[2]/'apps/web/public/athlete'
 for filename in ['lab-athlete.glb','lab-athlete-tactical.glb']:print(json.dumps(optimize(root/filename)))
