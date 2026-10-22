#!/usr/bin/env python3
"""Extract painted pixels from the approved concept into joint-aware PNG layers.

No character is redrawn. Polygon ownership and an exterior paper matte select
source pixels. A separate inpainted belly underlay can fill the obscured torso.
"""
from pathlib import Path
import json
from collections import deque
import hashlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'source/approved.png'
PARTS=ROOT/'assets/parts'

def polygon(points,size):
    im=Image.new('1',size);ImageDraw.Draw(im).polygon(points,fill=1)
    return np.asarray(im,dtype=bool)

def texture_edge_rgb(image):
    """Extend edge RGB under zero alpha for straight-alpha linear filtering."""
    pixels=np.array(image);alpha=pixels[:,:,3].copy();filled=alpha>0
    channels=pixels[:,:,:3].astype(float)
    height,width=filled.shape
    changed=0
    for _ in range(3):
        sums=np.zeros_like(channels);counts=np.zeros((height,width),float)
        for dy,dx in [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]:
            y0,y1=max(0,dy),min(height,height+dy);x0,x1=max(0,dx),min(width,width+dx)
            valid=filled[y0-dy:y1-dy,x0-dx:x1-dx]
            sums[y0:y1,x0:x1]+=channels[y0-dy:y1-dy,x0-dx:x1-dx]*valid[:,:,None]
            counts[y0:y1,x0:x1]+=valid
        new=(~filled)&(counts>0)
        channels[new]=sums[new]/counts[new,None]
        changed+=int(new.sum());filled|=new
    pixels[alpha==0,:3]=0
    pixels[(alpha==0)&filled,:3]=np.rint(channels[(alpha==0)&filled]).astype('uint8')
    assert np.array_equal(pixels[:,:,3],alpha)
    return Image.fromarray(pixels),changed

def main():
    src=Image.open(SOURCE).convert('RGB');rgb=np.array(src);h,w=rgb.shape[:2]
    r,g,b=[rgb[:,:,i].astype(float) for i in range(3)]
    # Only border-connected paper is removed: eye whites and the hat crescent stay.
    paper=(r>228)&(g>222)&(b>208)&(np.max(rgb,axis=2).astype(int)-np.min(rgb,axis=2)<42)
    background=np.zeros((h,w),bool);queue=deque()
    for x in range(w):
        for y in [0,h-1]:
            if paper[y,x] and not background[y,x]:background[y,x]=True;queue.append((y,x))
    for y in range(h):
        for x in [0,w-1]:
            if paper[y,x] and not background[y,x]:background[y,x]=True;queue.append((y,x))
    while queue:
        y,x=queue.popleft()
        for yy,xx in ((y-1,x),(y+1,x),(y,x-1),(y,x+1)):
            if 0<=yy<h and 0<=xx<w and paper[yy,xx] and not background[yy,xx]:
                background[yy,xx]=True;queue.append((yy,xx))
    foreground=~background
    # Pieces are assigned back-to-front; the residual is checked rather than dropped.
    definitions=[
      dict(id='cape_tail',pivot=[784,624],z=10,kind='cape',poly=[(185,568),(895,568),(916,755),(789,716),(700,676),(624,711),(547,807),(475,827),(376,805),(309,745),(242,727),(216,677)]),
      dict(id='body',pivot=[708,805],z=30,kind='body',poly=[(547,640),(650,617),(844,621),(896,673),(887,743),(848,796),(808,834),(714,863),(594,850),(530,806),(524,730)]),
      dict(id='leg_far',pivot=[815,825],z=35,kind='leg',poly=[(779,811),(841,803),(846,866),(876,926),(867,969),(830,986),(788,969),(741,928),(749,886),(779,867)]),
      dict(id='broom_shaft',pivot=[701,836],z=40,kind='broom',poly=[(459,844),(1119,655),(1167,651),(1197,683),(1184,720),(1151,738),(520,910),(458,892)]),
      dict(id='broom_brush',pivot=[459,875],z=41,kind='brush',poly=[(37,780),(347,780),(382,834),(466,834),(519,811),(539,834),(535,916),(510,1056),(448,1125),(47,1137)]),
      dict(id='leg_near',pivot=[643,829],z=45,kind='leg',poly=[(606,805),(672,805),(704,849),(699,889),(727,947),(725,992),(677,1011),(631,995),(595,958),(587,918),(607,888),(628,860)]),
      dict(id='head',pivot=[741,581],z=50,kind='head',poly=[(521,534),(524,464),(546,398),(602,355),(706,309),(792,295),(843,320),(878,363),(901,429),(898,492),(881,540),(850,577),(802,609),(746,611),(678,601),(608,581),(548,566)]),
      dict(id='cape_collar',pivot=[785,621],z=55,kind='collar',poly=[(510,578),(578,567),(687,587),(756,603),(812,593),(856,560),(891,569),(907,625),(903,689),(882,739),(866,671),(832,642),(786,648),(722,650),(642,638),(565,642),(512,670)]),
      dict(id='hat',pivot=[721,351],z=60,kind='hat',poly=[(109,57),(1017,179),(1017,446),(880,562),(751,590),(645,577),(538,575),(458,594),(319,587),(309,544),(414,485),(435,430),(293,399),(110,356)]),
      dict(id='wand_arm',pivot=[873,564],z=25,kind='arm',poly=[(861,544),(915,527),(962,487),(988,457),(1012,468),(1021,502),(1004,527),(967,556),(918,586),(879,599),(867,579)]),
      dict(id='wand_hand',pivot=[1006,504],z=70,kind='wand',poly=[(975,542),(969,521),(982,479),(999,458),(1024,449),(1088,299),(1102,271),(1124,273),(1125,304),(1053,481),(1041,519),(1017,540),(995,549)]),
      dict(id='holding_arm',pivot=[687,724],z=75,kind='holding_arm',poly=[(675,705),(696,707),(720,736),(761,759),(796,769),(815,784),(822,804),(808,823),(779,825),(761,809),(716,783),(688,755)]),
      dict(id='spark',pivot=[1128,248],z=80,kind='spark',poly=[(1036,170),(1203,170),(1203,324),(1036,324)])
    ]
    masks={};claimed=np.zeros((h,w),bool)
    # Specific pigment filters keep the hat and collar from taking visible green skin.
    purple=(r>g+12)&(b>g+8)
    green=(g>r*.88)&(g>b*1.25)&(r>b*.9)
    brown=(r>g*1.12)&(g>b*1.12)
    clasp=Image.new('1',src.size);ImageDraw.Draw(clasp).ellipse((754,589,814,648),fill=1)
    for d in definitions:
        mask=polygon(d['poly'],src.size)&foreground
        if d['id'] in ('hat','cape_collar'):mask &= purple|((r>228)&(g>199)&(b<224))
        if d['id']=='cape_collar':mask |= np.asarray(clasp,dtype=bool)&foreground
        if d['id']=='body':mask &= ~purple
        if d['id'] in ('leg_near','leg_far'):mask &= green|purple
        if d['id']=='broom_shaft':mask &= brown
        if d['id']=='spark':mask &= (r>214)&(g>144)&(b<202)
        if d['id']=='wand_arm':mask &= green
        masks[d['id']]=mask
    # Ownership priority is explicit, independent from display order.
    ownership=np.full((h,w),-1,np.int16)
    for idx,d in enumerate(definitions):ownership[masks[d['id']]]=idx
    ids={d['id']:idx for idx,d in enumerate(definitions)}
    residual=foreground&(ownership<0)
    # Assign missed painted boundary pixels to the nearest owned region, never erase.
    yx=np.argwhere(residual)
    for y,x in yx:
        routed=None
        if x>1035 and y<330 and r[y,x]>214 and g[y,x]>144 and b[y,x]<202:routed='spark'
        elif x<540 and y>782:routed='broom_brush'
        elif purple[y,x]:
            if y<577:routed='hat'
            elif y<700 and x>510:routed='cape_collar'
            elif y<820:routed='cape_tail'
            elif x<745:routed='leg_near'
            else:routed='leg_far'
        elif green[y,x]:
            if x>965 and y<548:routed='wand_hand'
            elif x>875 and y<610:routed='wand_arm'
            elif y<611:routed='head'
            elif y<815:routed='body'
            elif x<746:routed='leg_near'
            else:routed='leg_far'
        elif brown[y,x] and 520<x<1200 and 650<y<920:routed='broom_shaft'
        if routed:
            ownership[y,x]=ids[routed];continue
        found=False
        for radius in [1,2,3,5,9,17,33,65]:
            y0,y1=max(0,y-radius),min(h,y+radius+1);x0,x1=max(0,x-radius),min(w,x+radius+1)
            owned=np.argwhere(ownership[y0:y1,x0:x1]>=0)
            if len(owned):
                delta=owned+np.array([y0-y,x0-x]);nearest=owned[np.argmin(np.sum(delta*delta,axis=1))]
                ownership[y,x]=ownership[y0+nearest[0],x0+nearest[1]];found=True;break
        if not found:raise ValueError(f'No region near painted source pixel {(x,y)}')
    alpha=np.uint8(foreground)*255
    rgba=np.dstack([rgb,alpha]);master=Image.fromarray(rgba)
    (ROOT/'source').mkdir(parents=True,exist_ok=True);PARTS.mkdir(parents=True,exist_ok=True);(ROOT/'evidence').mkdir(parents=True,exist_ok=True)
    master.save(ROOT/'source/approved-cutout.png')
    parts=[];assembled=Image.new('RGBA',src.size)
    underlay=np.array(Image.open(ROOT/'source/belly-underlay-inpaint.png').convert('RGB'))
    ur,ug,ub=[underlay[:,:,i].astype(float) for i in range(3)]
    under_green=((ug>ur*.88)&(ug>ub*1.25)&(ur>ub*.9))|((ur>210)&(ug>180)&(ub>90)&(ub<210))
    wood_underlay=np.array(Image.open(ROOT/'source/broom-underlay-inpaint.png').convert('RGB'))
    wr,wg,wb=[wood_underlay[:,:,i].astype(float) for i in range(3)]
    under_wood=(wr>wg*1.12)&(wg>wb*1.12)&(wr<231)
    holding_idx=next(i for i,d in enumerate(definitions) if d['id']=='holding_arm')
    for idx,d in enumerate(definitions):
        mask=ownership==idx
        restored=np.zeros((h,w),bool)
        if d['id']=='body':
            restored=(ownership==holding_idx)&under_green&polygon(d['poly'],src.size)
            mask=mask|restored
        if d['id']=='broom_shaft':
            hidden=np.isin(ownership,[holding_idx,next(i for i,v in enumerate(definitions) if v['id']=='leg_near'),next(i for i,v in enumerate(definitions) if v['id']=='leg_far')])
            restored=hidden&under_wood&polygon(d['poly'],src.size)
            mask=mask|restored
        overlap=np.zeros((h,w),bool)
        if d['id'] in ('cape_tail','leg_near','leg_far','wand_arm'):
            expanded=np.asarray(Image.fromarray(np.uint8(mask)*255).filter(ImageFilter.MaxFilter(19)))>0
            overlap=expanded&foreground&~mask
            mask|=overlap
        if not mask.any():raise ValueError(f'Empty part: {d["id"]}')
        yy,xx=np.where(mask);x0,y0,x1,y1=int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)
        patch=rgba[y0:y1,x0:x1].copy();patch[:,:,3]=np.uint8(mask[y0:y1,x0:x1])*255
        restoration_source=wood_underlay if d['id']=='broom_shaft' else underlay
        patch[restored[y0:y1,x0:x1],:3]=restoration_source[y0:y1,x0:x1][restored[y0:y1,x0:x1]]
        image,edge_pixels=texture_edge_rgb(Image.fromarray(patch));file=f'assets/parts/{d["id"]}.png';image.save(ROOT/file)
        assembled.alpha_composite(image,(x0,y0))
        parts.append(dict(id=d['id'],file=file,x=x0,y=y0,width=x1-x0,height=y1-y0,
            pivot=d['pivot'],z=d['z'],kind=d['kind'],source_pixels=int((ownership==idx).sum()),
            inpainted_hidden_pixels=int(restored.sum()),joint_overlap_pixels=int(overlap.sum()),
            transparent_edge_rgb_pixels=edge_pixels))
    result=np.array(assembled)
    assert np.array_equal(result[:,:,3],rgba[:,:,3]) and np.array_equal(result[foreground,:3],rgba[foreground,:3]), 'Part reconstruction differs from source matte'
    # The neck is one painted, uncut surface under the head, collar and chest.
    # All four surfaces use the same head/torso/pelvis weight field in the rig.
    neck=np.array(Image.open(ROOT/'source/neck-underlay-inpaint.png').convert('RGB'))
    nr,ng,nb=[neck[:,:,i].astype(float) for i in range(3)]
    neck_skin=(ng>nr*.85)&(ng>nb*1.2)
    neck_band=polygon([(606,548),(864,548),(867,655),(854,696),(575,696),(577,624)],src.size)
    neck_mask=neck_band&neck_skin&np.isin(ownership,[ids[name] for name in ['head','body','cape_collar','holding_arm']])
    yy,xx=np.where(neck_mask);x0,y0,x1,y1=int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)
    neck_patch=np.dstack([neck,np.uint8(neck_mask)*255])[y0:y1,x0:x1]
    neck_image,edge_pixels=texture_edge_rgb(Image.fromarray(neck_patch));neck_image.save(PARTS/'neck_bridge.png')
    parts.append(dict(id='neck_bridge',file='assets/parts/neck_bridge.png',x=x0,y=y0,
        width=x1-x0,height=y1-y0,pivot=[741,610],z=29,kind='neck',source_pixels=0,
        inpainted_hidden_pixels=int(neck_mask.sum()),joint_overlap_pixels=0,transparent_edge_rgb_pixels=edge_pixels))
    # Complete the shoulder cloth under the head where the source has a notch.
    cape=np.array(Image.open(ROOT/'source/cape-underlap-inpaint.png').convert('RGB'))
    cr,cg,cb=[cape[:,:,i].astype(float) for i in range(3)]
    cape_purple=(cr>cg+12)&(cb>cg+8)
    cape_band=polygon([(500,548),(540,533),(620,548),(708,580),(711,643),(512,660)],src.size)
    cape_mask=cape_band&cape_purple
    yy,xx=np.where(cape_mask);x0,y0,x1,y1=int(xx.min()),int(yy.min()),int(xx.max()+1),int(yy.max()+1)
    cape_patch=np.dstack([cape,np.uint8(cape_mask)*255])[y0:y1,x0:x1]
    cape_image,edge_pixels=texture_edge_rgb(Image.fromarray(cape_patch));cape_image.save(PARTS/'cape_underlap.png')
    parts.append(dict(id='cape_underlap',file='assets/parts/cape_underlap.png',x=x0,y=y0,
        width=x1-x0,height=y1-y0,pivot=[600,594],z=9,kind='cape_underlap',source_pixels=0,
        inpainted_hidden_pixels=int(cape_mask.sum()),joint_overlap_pixels=0,transparent_edge_rgb_pixels=edge_pixels))
    assembled=Image.new('RGBA',src.size)
    for p in sorted(parts,key=lambda item:item['z']):
        assembled.alpha_composite(Image.open(ROOT/p['file']),(p['x'],p['y']))
    result=np.array(assembled)
    assert np.array_equal(result[foreground,:3],rgba[foreground,:3]), 'Underpainting changes visible rest-pose source pixels'
    assert np.all(result[:,:,3][foreground]==255), 'Underpainting removes painted source coverage'
    added_coverage=(result[:,:,3]>0)&~foreground
    assembled.save(ROOT/'evidence/reassembled.png')
    data=dict(schema='bean-wizard-parts/1',canvasWidth=w,canvasHeight=h,
        source=SOURCE.relative_to(ROOT).as_posix(),sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        art_source='AI-generated concept approved by user, source pixels extracted by polygon masks',
        parts=parts,matte=dict(method='border-connected warm paper flood fill',removed_pixels=int(background.sum())),
        reconstruction=dict(source_painted_pixels_exact=True,parts=len(parts),
            shoulder_notch_repair_added_pixels=int(added_coverage.sum()),
            residual_painted_pixels_assigned_to_nearest_region=len(yx)))
    (ROOT/'source/parts.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    board=Image.new('RGB',(1500,1050),'#F7F4EB');draw=ImageDraw.Draw(board)
    font=ImageFont.load_default(size=20)
    for idx,p in enumerate(parts):
        img=Image.open(ROOT/p['file']);img.thumbnail((270,260))
        col,row=idx%5,idx//5;x=col*300+(300-img.width)//2;y=row*350+34
        board.paste(img,(x,y),img);draw.text((col*300+12,row*350+306),p['id'],fill='#42334A',font=font)
    board.save(ROOT/'evidence/parts-contact.png')
    print(json.dumps(dict(parts=len(parts),painted_pixels=int(foreground.sum()),residual=len(yx))))

if __name__=='__main__':main()
