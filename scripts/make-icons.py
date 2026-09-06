"""生成扩展图标：深绿圆角方块 + 白色麦克风 + 声波弧线（几何绘制，无字体依赖）"""
from PIL import Image, ImageDraw
import os

GREEN = (22, 107, 91)
GREEN_DARK = (14, 78, 67)
WHITE = (255, 255, 255)

def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)

def draw_icon(size):
    s = size
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 背景：圆角方块（半径 ~22%）+ 轻微纵向渐变感（上浅下深两层）
    r = int(s * 0.22)
    rounded_rect(d, (0, 0, s - 1, s - 1), r, GREEN_DARK)
    inset = max(1, s // 32)
    rounded_rect(d, (inset, inset, s - 1 - inset, s - 1 - inset), max(2, r - inset), GREEN)

    cx = s / 2
    # 麦克风胶囊（居中偏上）：宽 22%，高 30%，端部全圆
    cap_w = s * 0.22
    cap_h = s * 0.34
    cap_x0 = cx - cap_w / 2
    cap_y0 = s * 0.18
    cap_x1 = cx + cap_w / 2
    cap_y1 = cap_y0 + cap_h
    rounded_rect(d, (cap_x0, cap_y0, cap_x1, cap_y1), cap_w / 2, WHITE)

    # 麦克风支架：U 形弧（线宽 ~7%）
    lw = max(2, int(s * 0.075))
    arc_r = s * 0.24
    arc_box = (cx - arc_r, s * 0.30, cx + arc_r, s * 0.30 + arc_r * 2)
    d.arc(arc_box, start=20, end=160, fill=WHITE, width=lw)

    # 竖杆
    stem_h = s * 0.10
    d.line((cx, cap_y1 + (arc_box[3] - cap_y1) * 0.0 + arc_r * 0.55,
            cx, cap_y1 + arc_r * 0.55 + stem_h), fill=WHITE, width=lw)
    # 底座
    base_w = s * 0.24
    base_h = max(2, s * 0.055)
    base_y = cap_y1 + arc_r * 0.55 + stem_h + base_h * 0.4
    rounded_rect(d, (cx - base_w / 2, base_y, cx + base_w / 2, base_y + base_h), base_h / 2, WHITE)

    # 右上角声波弧线两条（宽 ~ 4%）
    wave_lw = max(2, int(s * 0.05))
    for i, wr in enumerate([s * 0.14, s * 0.22]):
        box = (s * 0.72 - wr, s * 0.22 - wr, s * 0.72 + wr, s * 0.22 + wr)
        d.arc(box, start=-55, end=55, fill=WHITE, width=wave_lw)

    return img

sizes = [16, 32, 48, 128]
out_dir = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(out_dir, exist_ok=True)
for size in sizes:
    img = draw_icon(size)
    # 128 的同时输出一个 2x 高清版供 README 引用
    img.save(os.path.join(out_dir, f'icon{size}.png'))
    print(f'icon{size}.png ✓')
img = draw_icon(256)
img.save(os.path.join(out_dir, 'icon256.png'))
print('icon256.png ✓ (README 用)')
