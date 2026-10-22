from pathlib import Path
import hashlib
import json
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets/parts'
OUT.mkdir(parents=True, exist_ok=True)
(ROOT / 'evidence').mkdir(exist_ok=True)
records = []

def source(name):
    im = Image.open(ROOT / 'source' / name).convert('RGBA')
    pixels = np.array(im)
    # Detached low-alpha generation debris is excluded from the material masks.
    pixels[pixels[:, :, 3] < 24] = 0
    return Image.fromarray(pixels)

def part(name, image, box, mask=None, origin=None, kind='painted'):
    image = image.crop(box)
    if mask is not None:
        rgba = np.array(image)
        rgba[:, :, 3] = np.minimum(rgba[:, :, 3], np.asarray(mask.crop(box)))
        image = Image.fromarray(rgba)
    image.save(OUT / f'{name}.png')
    records.append(dict(id=name, file=f'assets/parts/{name}.png', x=box[0], y=box[1], width=image.width, height=image.height, kind=kind, **({'origin': origin} if origin else {})))

opened = source('master-open.png')
closed = source('master-closed.png')
assert opened.size == closed.size == (1448, 1086)

# The original front, leaf clasp and cavity share the same untouched source canvas.
back_mask = Image.new('L', opened.size)
ImageDraw.Draw(back_mask).rectangle((180, 491, 1270, 646), fill=255)
front = Image.new('L', opened.size)
d = ImageDraw.Draw(front)
d.rectangle((180, 633, 1270, 1086), fill=255)

clasp_box = (607, 615, 841, 828)
clasp = opened.crop(clasp_box)
rgb = np.asarray(clasp)[:,:,:3].astype(float)
gold = (rgb[:,:,0] > rgb[:,:,1]+12) & (rgb[:,:,1] > rgb[:,:,2]*1.35)
# The complete gold outline encloses the leaf; fill that outline's interior.
outside = np.zeros(gold.shape, bool)
queue = [(y,x) for y in range(gold.shape[0]) for x in (0,gold.shape[1]-1)] + [(y,x) for x in range(gold.shape[1]) for y in (0,gold.shape[0]-1)]
for y,x in queue:
    if not gold[y,x]:outside[y,x]=True
for y,x in queue:
    for dy,dx in ((-1,0),(1,0),(0,-1),(0,1)):
        yy,xx=y+dy,x+dx
        if 0<=yy<gold.shape[0] and 0<=xx<gold.shape[1] and not gold[yy,xx] and not outside[yy,xx]:
            outside[yy,xx]=True;queue.append((yy,xx))
clasp_mask = Image.new('L', opened.size)
clasp_mask.paste(Image.fromarray(np.uint8(~outside)*255), (clasp_box[0],clasp_box[1]))
clasp_outline = Image.new('L', opened.size)
ImageDraw.Draw(clasp_outline).polygon([(721,617),(746,637),(771,662),(789,691),(802,701),(821,703),(837,715),(840,748),(828,768),(800,779),(783,793),(768,814),(742,828),(712,828),(688,811),(671,789),(657,779),(628,774),(611,762),(607,734),(613,712),(631,702),(653,701),(671,683),(690,654)],fill=255)
clasp_mask=Image.fromarray(np.minimum(np.asarray(clasp_mask),np.asarray(clasp_outline)))
body_ownership=255-np.asarray(clasp_mask)
back_mask=Image.fromarray(np.minimum(np.asarray(back_mask),body_ownership))
front=Image.fromarray(np.minimum(np.asarray(front),body_ownership))
part('box_back', opened, (197, 491, 1254, 647), back_mask)
part('box_front', opened, (197, 633, 1254, 986), front)
part('clasp', opened, clasp_box, clasp_mask)

panel = source('lid-panel.png')
pa = np.asarray(panel.getchannel('A'))
yy, xx = np.indices(pa.shape)
solid = (pa > 220) & (xx > panel.width * .04) & (xx < panel.width * .96) & (yy > panel.height * .08) & (yy < panel.height * .93)
ys, xs = np.where(solid)
panel_box = (int(xs.min()) + 3, int(ys.min()) + 3, int(xs.max()) - 2, int(ys.max()) - 2)
part('lid_outer', panel, panel_box)
strip = panel.crop((panel_box[0] + 130, panel_box[1] + 12, panel_box[2] - 130, panel_box[1] + 24))
strip = strip.resize((828, 16), Image.Resampling.LANCZOS)
part('hinge_band', strip, (0, 0, 828, 16), origin=[311, 491], kind='gold hinge material extracted from lid panel')
inner = opened.transform((1024, 320), Image.Transform.QUAD,
    (237, 241, 311, 491, 1139, 491, 1210, 241), Image.Resampling.BICUBIC)
part('lid_inner', inner, (0, 0, 1024, 320), kind='painted inner panel rectified to material UV')
edge = panel.crop((panel_box[0]+220, panel_box[1]+80, panel_box[0]+420, panel_box[1]+250)).resize((640,64), Image.Resampling.LANCZOS)
rim = panel.crop((panel_box[0]+130,panel_box[1]+12,panel_box[2]-130,panel_box[1]+22)).resize((640,7), Image.Resampling.LANCZOS)
edge.paste(rim,(0,0));edge.paste(rim,(0,57))
part('lid_edge',edge,(0,0,640,64),kind='matching wood thickness material with original gold rim')

reward = source('reward-seed.png')
alpha = np.asarray(reward.getchannel('A'))
ys, xs = np.where(alpha > 180)
reward_box = (int(xs.min()) - 3, int(ys.min()) - 3, int(xs.max()) + 4, int(ys.max()) + 4)
part('reward', reward, reward_box)

star = Image.new('RGBA', (96, 96))
pts = []
for i in range(8):
    angle = -math.pi / 2 + i * math.pi / 4
    radius = 44 if i % 2 == 0 else 10
    pts.append((48 + math.cos(angle) * radius, 48 + math.sin(angle) * radius))
ImageDraw.Draw(star).polygon(pts, fill='#FFDA70')
part('spark', star, (0, 0, 96, 96), kind='procedural effect')

glow = Image.new('RGBA', (256, 256))
a = np.array(glow)
yy, xx = np.indices((256, 256))
radius = np.sqrt(((xx - 128) / 128) ** 2 + ((yy - 128) / 128) ** 2)
a[:, :, :3] = [255, 215, 112]
a[:, :, 3] = np.uint8(np.clip(1 - radius, 0, 1) ** 2 * 110)
part('glow', Image.fromarray(a), (0, 0, 256, 256), kind='procedural effect')

data = dict(canvas=[1448, 1086], origin=[724, 970], parts=records,
            sourceSha256={p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT / 'source').glob('*.png'))},
            scope='Painted prop surfaces extracted from static image_gen renders; flat outer panel, inner side and hidden cavity are separately prepared matching material. Closed lid is registered to the shared hinge plane, not claimed pixel-identical to the concept composite.')
(ROOT / 'source/parts.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
board = Image.new('RGB', (1400, 660), '#f4f0e6')
draw = ImageDraw.Draw(board)
font = ImageFont.load_default(size=18)
for i, record in enumerate(records):
    im = Image.open(ROOT / record['file'])
    im.thumbnail((300, 250))
    x, y = i % 4 * 350, i // 4 * 330
    board.paste(im, (x + (350 - im.width) // 2, y + 10), im)
    draw.text((x + 16, y + 282), record['id'], fill='#344d3b', font=font)
board.save(ROOT / 'evidence/parts.png')
print(json.dumps({'parts': len(records), 'materialSource': 'master-open.png + master-closed.png + reward-seed.png'}))
