"""glTF animation/buffer optimizer; no runtime decoder required.
1. Prune sampled tracks identical to the bind/local default (lossless).
2. Key-reduce the remaining baked 24 fps tracks: a key is dropped only if linear
   (quaternion: normalized-lerp) interpolation of its neighbours reproduces it within
   0.02 deg / 0.2 mm, so loop closure and foot contacts are preserved.
3. Compact accessors/buffers and attach the motion table (stride lengths, clip modes).
"""
import json,struct,os,math
from pathlib import Path
WIDTH={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
FMT={5126:'f',5125:'I',5123:'H',5121:'B'}
def reduce_track(times,vals,width,rotation,tol):
 n=len(times);keep={0,n-1}
 def sample(i,j,k):
  u=(times[k]-times[i])/(times[j]-times[i]) if times[j]!=times[i] else 0
  a=vals[i*width:(i+1)*width];b=vals[j*width:(j+1)*width]
  if rotation:
   if sum(x*y for x,y in zip(a,b))<0:b=[-x for x in b]
   r=[x+(y-x)*u for x,y in zip(a,b)];m=sum(x*x for x in r)**.5 or 1;return [x/m for x in r]
  return [x+(y-x)*u for x,y in zip(a,b)]
 def err(k,r):
  actual=vals[k*width:(k+1)*width]
  if rotation:
   d=abs(sum(x*y for x,y in zip(actual,r)));return 2*math.acos(min(1,d))
  return max(abs(x-y) for x,y in zip(actual,r))
 stack=[(0,n-1)]
 while stack:
  i,j=stack.pop()
  if j-i<2:continue
  worst=0;at=-1
  for k in range(i+1,j):
   e=err(k,sample(i,j,k))
   if e>worst:worst=e;at=k
  if worst>tol:keep.add(at);stack.append((i,at));stack.append((at,j))
 idx=sorted(keep);return idx

def optimize(path,meta=None):
 raw=Path(path).read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl]);bl=struct.unpack_from('<I',raw,20+jl)[0];binary=raw[28+jl:28+jl+bl]
 def values(index):
  a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];fmt=FMT[a['componentType']];n=a['count']*WIDTH[a['type']];return struct.unpack_from('<'+str(n)+fmt,binary,v.get('byteOffset',0)+a.get('byteOffset',0))
 # Vertex quantisation (core glTF, normalised integer attributes): COLOR_0 -> u8x4,
 # WEIGHTS_0 -> u16x4, TEXCOORD_0 -> u16x2. ~30% smaller meshes, no extension needed.
 def quantise():
  nonlocal binary
  done={}
  for mesh in doc.get('meshes',[]):
   for prim in mesh['primitives']:
    for key,(ctype,ncomp,kind) in {'COLOR_0':(5121,4,'VEC4'),'WEIGHTS_0':(5123,4,'VEC4'),'TEXCOORD_0':(5123,2,'VEC2')}.items():
     if key not in prim['attributes']:continue
     index=prim['attributes'][key]
     if index in done:prim['attributes'][key]=done[index];continue
     a=doc['accessors'][index]
     if a['componentType']!=5126:continue
     data=values(index);w=WIDTH[a['type']];n=a['count'];top=255 if ctype==5121 else 65535
     out=[]
     for i in range(n):
      row=list(data[i*w:(i+1)*w])
      if key=='COLOR_0' and w==3:row.append(1.0)
      if key=='WEIGHTS_0':
       t=sum(row) or 1.0;row=[x/t for x in row]
      out.extend(max(0,min(top,round(x*top))) for x in row)
     if key=='WEIGHTS_0':
      # make each u16 quad sum to exactly 65535 so skinning stays normalised
      for i in range(n):
       q=out[i*4:(i+1)*4];d=65535-sum(q);j=max(range(4),key=lambda k:q[k]);q[j]+=d;out[i*4:(i+1)*4]=q
     while len(binary)%4:binary+=b'\0'
     off=len(binary);binary+=struct.pack('<'+str(len(out))+('B' if ctype==5121 else 'H'),*out)
     while len(binary)%4:binary+=b'\0'
     doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(out)*(1 if ctype==5121 else 2)})
     doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':ctype,'normalized':True,'count':n,'type':kind})
     done[index]=len(doc['accessors'])-1;prim['attributes'][key]=done[index]
 quantise()
 extra=bytearray()
 def add_accessor(data,kind):
  nonlocal binary
  while len(binary)%4:binary+=b'\0'
  offset=len(binary);binary+=struct.pack('<'+str(len(data))+'f',*data)
  doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(data)*4})
  acc={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(data)//WIDTH[kind],'type':kind}
  if kind=='SCALAR':acc['min']=[min(data)];acc['max']=[max(data)]
  doc['accessors'].append(acc);return len(doc['accessors'])-1
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
   times=values(sampler['input']);idx=reduce_track(times,val,width,prop=='rotation',.00035 if prop=='rotation' else .0002)
   if len(idx)<len(times):
    nt=[times[i] for i in idx];nv=[x for i in idx for x in val[i*width:(i+1)*width]]
    sampler=dict(sampler);sampler['input']=add_accessor(nt,'SCALAR');sampler['output']=add_accessor(nv,{3:'VEC3',4:'VEC4'}[width])
   channel['sampler']=len(samplers);samplers.append(sampler);channels.append(channel)
  anim['channels']=channels;anim['samplers']=samplers
 # Pack every animation accessor into ONE buffer view and de-duplicate identical
 # data (all tracks of a clip share their time axis); this removes hundreds of
 # accessor/view JSON records.
 table={};blob=bytearray();packed=[]
 while len(binary)%4:binary+=b'\0'
 base=len(binary)
 for anim in doc.get('animations',[]):
  for sm in anim['samplers']:
   for key in ('input','output'):
    a=doc['accessors'][sm[key]];v=doc['bufferViews'][a['bufferView']];n=a['count']*WIDTH[a['type']]*4
    off=v.get('byteOffset',0)+a.get('byteOffset',0);data=bytes(binary[off:off+n]);ident=(a['type'],a['count'],data)
    if ident not in table:
     rec={'componentType':5126,'count':a['count'],'type':a['type'],'byteOffset':len(blob)}
     if a['type']=='SCALAR':fl=struct.unpack('<'+str(a['count'])+'f',data);rec['min']=[min(fl)];rec['max']=[max(fl)]
     blob+=data;packed.append(rec);table[ident]=len(packed)-1
    sm[key]=('NEW',table[ident])
 if packed:
  doc['bufferViews'].append({'buffer':0,'byteOffset':base,'byteLength':len(blob)});view=len(doc['bufferViews'])-1;binary+=bytes(blob)
  first=len(doc['accessors'])
  for rec in packed:rec['bufferView']=view;doc['accessors'].append(rec)
  for anim in doc.get('animations',[]):
   for sm in anim['samplers']:
    for key in ('input','output'):sm[key]=first+sm[key][1]
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
 ex=doc.setdefault('asset',{}).setdefault('extras',{})
 ex['CourtIQ']='Locally authored procedural basketball actions; shared rig LOD; track pruning + key reduction.'
 if meta:ex['CourtIQMotion']=meta
 encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);newbinary.extend(b'\0'*((-len(newbinary))%4))
 output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(newbinary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(newbinary),0x004e4942)+newbinary
 Path(path).write_bytes(output)
 return {'path':str(path),'beforeBytes':len(raw),'afterBytes':len(output),'beforeTracks':original,'afterTracks':sum(len(a['channels']) for a in doc.get('animations',[]))}
if __name__=='__main__':
 root=Path(__file__).resolve().parents[2]/'apps/web/public/athlete'
 for filename in ['lab-athlete.glb','lab-athlete-tactical.glb']:print(json.dumps(optimize(root/filename)))
