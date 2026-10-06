"""python3 scripts/athlete/filmstrip.py out.png in_0.png in_1.png ... [--cols N] : tile frames."""
import sys
from PIL import Image
args=sys.argv[1:];cols=0
if '--cols' in args:i=args.index('--cols');cols=int(args[i+1]);del args[i:i+2]
out,files=args[0],args[1:]
ims=[Image.open(f).convert('RGB') for f in files];cols=cols or len(ims);rows=(len(ims)+cols-1)//cols
w,h=ims[0].size;sheet=Image.new('RGB',(w*cols,h*rows))
for k,im in enumerate(ims):sheet.paste(im,((k%cols)*w,(k//cols)*h))
sheet.save(out)
