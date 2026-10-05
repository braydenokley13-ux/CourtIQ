"""Assemble unaltered CPU pose renders into a labeled production review sheet.
Run after render_studio_athlete.py. Requires Pillow.
"""
from pathlib import Path
import json
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
report=json.loads((ROOT/'apps/web/public/athlete/lab-athlete-build.json').read_text())
poses=[('defense_ready','READY DEFENSE'),('defense_slide_left','LATERAL SLIDE'),('cut_run','CUT / RUN'),('screen_plant','PLANTED SCREEN'),('chest_pass','CHEST PASS'),('closeout','HIGH-HAND CLOSEOUT')]
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,22);small=ImageFont.truetype(fontpath,16)
canvas=Image.new('RGB',(1500,1350),'#f4f0e8');draw=ImageDraw.Draw(canvas)
draw.text((28,20),'COURTIQ / BASKETBALL MOTION SOURCE',font=font,fill='#244b4b')
draw.text((28,52),f"{len(report['clips'])} authored actions · One rig · {report['lod0']['triangles']:,} / {report['lod1']['triangles']:,} triangles",font=small,fill='#626862')
for i,(name,title) in enumerate(poses):
 image=Image.open('/tmp/courtiq-athlete-studio/'+name+'.png').convert('RGB')
 x=(i%3)*500;y=86+(i//3)*624
 canvas.paste(image,(x,y));draw.text((x+22,y+600),title,font=small,fill='#244b4b')
out=ROOT/'scripts/athlete/review/lab-athlete-contact-sheet.png';out.parent.mkdir(parents=True,exist_ok=True);canvas.save(out)
print(out)
