#!/usr/bin/env python3
"""生成扩展图标：lucide Speech 图标（与设置页"识别"Tab 同一款），
白色圆角底 + 深灰描边，几何矢量渲染（自实现 SVG path 解析，无外部依赖）。

用法规律：python3 scripts/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os
import re

SIZE_GRID = 24          # lucide viewBox
STROKE_W = 2.0          # lucide 默认描边
CARD = 512              # 底稿分辨率
ICON_RATIO = 0.68       # 图形占卡片比例
BG = (255, 255, 255, 255)
BORDER = (226, 232, 240, 255)
STROKE = (30, 41, 59, 255)   # #1e293b
RADIUS_RATIO = 0.225

# lucide-react v0.469 Speech 图标的原始路径
SPEECH_PATHS = [
    "M8.8 20v-4.1l1.9.2a2.3 2.3 0 0 0 2.164-2.1V8.3A5.37 5.37 0 0 0 2 8.25c0 2.8.656 3.054 1 4.55a5.77 5.77 0 0 1 .029 2.758L2 20",
    "M19.8 17.8a7.5 7.5 0 0 0 .003-10.603",
    "M17 15a3.5 3.5 0 0 0-.025-4.975",
]

NUM = re.compile(r'[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?')


def tokenize_path(d):
    """把 path 字符串解析为 [(cmd, [参数...]), ...]，处理数字连写与隐式重复命令"""
    tokens = []
    for m in re.finditer(r'([MmLlHhVvAaCcSsQqTtZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)', d):
        if m.group(1):
            tokens.append(('cmd', m.group(1)))
        else:
            tokens.append(('num', float(m.group(2))))
    parsed = []
    i = 0
    while i < len(tokens):
        kind, val = tokens[i]
        if kind != 'cmd':
            i += 1
            continue
        cmd = val
        arity = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'Z': 0, 'C': 6, 'S': 4, 'Q': 4, 'T': 2, 'A': 7}.get(cmd.upper(), 0)
        i += 1
        nums = []
        first = True
        while i < len(tokens) and tokens[i][0] == 'num':
            nums.append(tokens[i][1])
            i += 1
            if len(nums) == arity:
                parsed.append((cmd if first else implicit(cmd), nums))
                first = False
                nums = []
                if arity == 0:
                    break
        if nums and arity > 0:
            raise ValueError(f'参数不完整: {cmd} {nums}')
        if arity == 0:
            parsed.append((cmd, []))
    return parsed


def implicit(cmd):
    # M 后续隐式为 L；m 后续隐式为 l
    return 'L' if cmd == 'M' else ('l' if cmd == 'm' else cmd)


def arc_to_points(x0, y0, rx, ry, rot_deg, large, sweep, x1, y1, segments=48):
    """椭圆弧端点参数化（SVG 规范 F.6.5），采样为折线点"""
    if rx == 0 or ry == 0:
        return [(x1, y1)]
    rx, ry = abs(rx), abs(ry)
    phi = math.radians(rot_deg % 360)
    cos_p, sin_p = math.cos(phi), math.sin(phi)
    dx, dy = (x0 - x1) / 2, (y0 - y1) / 2
    x1p = cos_p * dx + sin_p * dy
    y1p = -sin_p * dx + cos_p * dy
    lam = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2
    if lam > 1:
        s = math.sqrt(lam)
        rx, ry = rx * s, ry * s
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    c = math.sqrt(max(0, num / den)) * (1 if large != sweep else -1)
    cxp = c * rx * y1p / ry
    cyp = -c * ry * x1p / rx
    phi0 = math.atan2(1, 0)  # placeholder
    cx = cos_p * cxp - sin_p * cyp + (x0 + x1) / 2
    cy = sin_p * cxp + cos_p * cyp + (y0 + y1) / 2
    ux = (x1p - cxp) / rx
    uy = (y1p - cyp) / ry
    vx = (-x1p - cxp) / rx
    vy = (-y1p - cyp) / ry
    theta1 = math.atan2(uy, ux)
    theta2 = math.atan2(vy, vx)
    dtheta = theta2 - theta1
    if sweep == 0 and dtheta > 0:
        dtheta -= 2 * math.pi
    elif sweep == 1 and dtheta < 0:
        dtheta += 2 * math.pi
    pts = []
    for i in range(1, segments + 1):
        t = theta1 + dtheta * i / segments
        px = cx + rx * math.cos(t) * cos_p - ry * math.sin(t) * sin_p
        py = cy + rx * math.cos(t) * sin_p + ry * math.sin(t) * cos_p
        pts.append((px, py))
    return pts


def cubic_points(x0, y0, c1x, c1y, c2x, c2y, x1, y1, segments=32):
    pts = []
    for i in range(1, segments + 1):
        t = i / segments
        mt = 1 - t
        x = mt**3 * x0 + 3 * mt**2 * t * c1x + 3 * mt * t**2 * c2x + t**3 * x1
        y = mt**3 * y0 + 3 * mt**2 * t * c1y + 3 * mt * t**2 * c2y + t**3 * y1
        pts.append((x, y))
    return pts


def render_path(d):
    """path → 24 坐标系折线列表（每条子路径一个点列）"""
    subpaths = []
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    pts = []
    for cmd, nums in tokenize_path(d):
        U = cmd.upper()
        rel = cmd.islower()
        if U == 'M':
            if pts:
                subpaths.append(pts)
                pts = []
            x, y = nums
            cur = (x, y) if not rel else (cur[0] + x, cur[1] + y)
            start = cur
            pts = [cur]
        elif U == 'L':
            x, y = nums
            cur = (x, y) if not rel else (cur[0] + x, cur[1] + y)
            pts.append(cur)
        elif U == 'H':
            x = nums[0]
            cur = (x, cur[1]) if not rel else (cur[0] + x, cur[1])
            pts.append(cur)
        elif U == 'V':
            y = nums[0]
            cur = (cur[0], y) if not rel else (cur[0], cur[1] + y)
            pts.append(cur)
        elif U == 'A':
            rx, ry, rot, large, sweep, x, y = nums
            x1, y1 = (x, y) if not rel else (cur[0] + x, cur[1] + y)
            pts.extend(arc_to_points(cur[0], cur[1], rx, ry, rot, large, sweep, x1, y1))
            cur = (x1, y1)
        elif U == 'C':
            c1x, c1y, c2x, c2y, x, y = nums
            if rel:
                c1x += cur[0]; c1y += cur[1]; c2x += cur[0]; c2y += cur[1]; x += cur[0]; y += cur[1]
            pts.extend(cubic_points(cur[0], cur[1], c1x, c1y, c2x, c2y, x, y))
            cur = (x, y)
        elif U == 'Z':
            pts.append(start)
            cur = start
    if pts:
        subpaths.append(pts)
    return subpaths


def draw_stroke(draw, subpaths, scale, offset, width, color):
    """width 为已换算好的像素线宽（调用方负责 scale 换算，避免二次缩放）"""
    ox, oy = offset
    def tp(p):
        return (ox + p[0] * scale, oy + p[1] * scale)
    w = max(1, int(width))
    r = w / 2
    for pts in subpaths:
        tpts = [tp(p) for p in pts]
        # PIL 在大线宽 + 过密点（间距 < 线宽/2）时逐段多边形会退化成放射伪影，
        # 抽稀到间距 >= 线宽的一半；曲线平滑由圆头端点与 joint='curve' 保证
        dense = [tpts[0]]
        min_gap = max(2.0, w * 0.6)
        for p in tpts[1:]:
            last = dense[-1]
            if math.hypot(p[0] - last[0], p[1] - last[1]) >= min_gap:
                dense.append(p)
        dense.append(tpts[-1])
        if len(dense) == 1:
            x, y = dense[0]
            draw.ellipse((x - r, y - r, x + r, y + r), fill=color)
            continue
        draw.line(dense, fill=color, width=w, joint='curve')
        # 圆头端点
        for x, y in (dense[0], dense[-1]):
            draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def make_card(card_size=CARD, stroke_w=STROKE_W, ratio=ICON_RATIO):
    scale = card_size * ratio / SIZE_GRID
    glyph = card_size * ratio               # 图形占卡片的比例（像素）
    offset = ((card_size - glyph) / 2, (card_size - glyph) / 2)

    img = Image.new('RGBA', (card_size, card_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 白色圆角底 + 浅灰描边环（亮暗工具栏都有可见度）
    radius = card_size * RADIUS_RATIO
    ring = max(2, int(card_size * 0.02))
    d.rounded_rectangle((0, 0, card_size - 1, card_size - 1), radius=radius, fill=BG, outline=BORDER, width=ring)

    # lucide Speech 描边（宽 2/24，圆头）
    for path_d in SPEECH_PATHS:
        draw_stroke(d, render_path(path_d), scale, offset, stroke_w * scale, STROKE)

    # 圆角透明蒙版
    mask = Image.new('L', (card_size, card_size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, card_size - 1, card_size - 1), radius=radius, fill=255)
    img.putalpha(mask)
    return img


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
    os.makedirs(out_dir, exist_ok=True)
    card = make_card(CARD)
    card.save(os.path.join(out_dir, 'icon.svg.png'))  # 高清底稿（自检用）
    for size in [16, 32, 48, 128, 256]:
        if size <= 32:
            # 小尺寸细线会糊：加粗描边、放大占比后重绘再缩
            card_small = make_card(CARD, stroke_w=2.6, ratio=0.76)
            card_small.resize((size, size), Image.LANCZOS).save(os.path.join(out_dir, f'icon{size}.png'))
        else:
            card.resize((size, size), Image.LANCZOS).save(os.path.join(out_dir, f'icon{size}.png'))
        print(f'icon{size}.png ✓')
    print('全部图标已生成（lucide Speech · 白底深灰描边）')


if __name__ == '__main__':
    main()
