#!/usr/bin/env python3
"""Draws the Island 03 (Keelhaven) concept diagrams from the spec's numbers
(docs/specs/ISLAND-03-keelhaven.md) and prints the world positions, walking distances and headings
that the spec's tables use.

Run: python3 docs/specs/island-03/draw.py  (writes top-down-layout.svg and two-circuits.svg next to
this file). Hand-drawn vector diagrams only; no AI art, no reference-renderer code.

Island frame: every place is given as (s, t): s metres along the cove axis u (bearing 143°, from the
harbour mouth toward the valley head), t metres along v (bearing 53°, toward the north-east ridge),
from the island centre C. World: x east, z south (-z is north), as the game's code.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
C = (3800.0, -1650.0)
U = (math.sin(math.radians(143)), -math.cos(math.radians(143)))  # (0.6018, 0.7986)
V = (math.sin(math.radians(53)), -math.cos(math.radians(53)))  # (0.7986, -0.6018)
FONT = "font-family='Georgia, serif'"
SANS = "font-family='Helvetica, Arial, sans-serif'"


def world(s, t):
    return (C[0] + s * U[0] + t * V[0], C[1] + s * U[1] + t * V[1])


def bearing_of(a, b):
    """Bearing (degrees clockwise from north = -z) from world point a to world point b."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    return math.degrees(math.atan2(dx, -dz)) % 360


def heading_to(a, b):
    """The code's heading h (faces (sin h, cos h)) from a toward b."""
    return math.atan2(b[0] - a[0], b[1] - a[1])


# ---------------------------------------------------------------- data (s, t, y)
PLACES = {
    'berth': (-268.0, -95.4, 0.0),
    'landing': (-262.0, -110.0, 2.2),
    'market': (-246.0, -121.0, 2.2),
    'lyra': (-219.0, -133.0, 2.8),
    'hester': (-182.0, 40.0, 2.4),
    'dory': (-150.0, 99.0, 7.0),
    'dd2Caisson': (-152.0, 122.0, 7.0),
    'cass': (-146.0, 118.0, 7.0),
    'barty': (-258.0, 96.0, 6.0),
    'stroud': (-262.0, 122.0, 7.0),
    'arlo': (-300.0, 140.0, 5.0),
    'ottoline': (-398.0, 168.0, 10.0),
    'gateLight': (-404.0, 176.0, 10.0),
    'valleyPool': (255.0, 10.0, 48.0),
}

ROUTE = [  # the main path, in the chapter's order
    ('Landing (quay)', (-262.0, -110.0, 2.2)),
    ('Q3.1 Lyra, tavern porch', (-219.0, -133.0, 2.8)),
    ('beach west end', (-194.0, -96.0, 1.6)),
    ('beach middle', (-176.0, -42.0, 1.4)),
    ('river bridge', (-168.0, 12.0, 2.2)),
    ('Q3.2 Hester, slipway head', (-182.0, 40.0, 2.4)),
    ('shipyard gate (ramp top)', (-162.0, 68.0, 7.0)),
    ('Q3.3 Dory, Drydock 1 caisson', (-150.0, 99.0, 7.0)),
    ('Q3.4-Q3.5 Cass, Drydock 2 caisson', (-146.0, 118.0, 7.0)),
    ('basin south-west quay, east end', (-152.0, 92.0, 7.0)),
    ('basin south-west quay, west end', (-222.0, 92.0, 7.0)),
    ('Q3.6 Barty, Wreck Point', (-258.0, 96.0, 6.0)),
    ('Q3.7-Q3.8 Stroud, harbourmaster\'s office', (-262.0, 122.0, 7.0)),
    ('towpath, Lock 2', (-300.0, 140.0, 5.0)),
    ('towpath, Lock 3 and the rock cut', (-350.0, 154.0, 3.0)),
    ('Q3.10 Ottoline, gatehouse deck', (-398.0, 168.0, 10.0)),
]

RING = [  # the Drydock 2 ring (Two Circuits round 1), walked anticlockwise from the caisson
    ('caisson (Understand; the Seal post at the end)', (-152.0, 122.0, 7.0)),
    ('south-west wall: Change', (-125.0, 112.0, 7.0)),
    ('south-west wall: Inspect (the slate)', (-100.0, 112.0, 7.0)),
    ('dock head: Test & Build', (-93.0, 122.0, 7.0)),
    ('north-east wall: Preview (the lookout)', (-120.0, 132.0, 7.0)),
    ('caisson', (-152.0, 122.0, 7.0)),
]

VALLEY_LOOP = [  # optional, from the river bridge up the south-west bank, back down the north-east bank
    ('river bridge', (-168.0, 12.0, 2.2)),
    ('south-west bank', (-40.0, -20.0, 12.0)),
    ('ford', (120.0, -10.0, 30.0)),
    ('Falls Pool', (255.0, 10.0, 48.0)),
    ('north-east bank', (120.0, 40.0, 30.0)),
    ('shipyard back gate', (-90.0, 90.0, 7.0)),
]


def dist3(a, b):
    pa, pb = world(a[0], a[1]), world(b[0], b[1])
    return math.dist((pa[0], a[2], pa[1]), (pb[0], b[2], pb[1]))


def walk(points):
    total = 0.0
    rows = []
    for i, (name, p) in enumerate(points):
        leg = 0.0 if i == 0 else dist3(points[i - 1][1], p)
        total += leg
        w = world(p[0], p[1])
        rows.append((name, w, p[2], leg, total))
    return rows


def report():
    print('World positions (x, y, z):')
    for k, (s, t, y) in PLACES.items():
        w = world(s, t)
        print(f'  {k:12s} ({w[0]:7.1f}, {y:5.1f}, {w[1]:8.1f})')
    for title, pts in (('Main route', ROUTE), ('Drydock 2 ring', RING), ('Valley loop', VALLEY_LOOP)):
        print(f'\n{title}:')
        for name, w, y, leg, total in walk(pts):
            print(f'  {name:44s} ({w[0]:7.1f}, {y:5.1f}, {w[1]:8.1f})  leg {leg:6.1f}  total {total:6.1f}')
    land = world(*PLACES['landing'][:2])
    print('\nFrom the landing:')
    for k in ('hester', 'dory', 'ottoline', 'valleyPool'):
        b = bearing_of(land, world(*PLACES[k][:2]))
        print(f'  bearing to {k:10s} {b:6.1f}°')
    print(f"  landing heading toward Hester: {heading_to(land, world(*PLACES['hester'][:2])):.3f} rad")
    print(f'  berth heading (bow to the mouth, bearing 323°): {heading_to((0, 0), (U[0] * -1, U[1] * -1)):.3f} rad')
    tb = (2050.0, -1500.0)
    for k in ('berth', 'landing', 'hester', 'ottoline'):
        w = world(*PLACES[k][:2])
        print(f'  centre distance to Thousand-Bough from {k:9s} {math.dist(w, tb):6.0f} m')


# ---------------------------------------------------------------- top-down layout SVG
W, H = 1100, 1000
X0, Z0, SCALE = 3300.0, -2230.0, 1.0  # world box x 3300..4400, z -2230..-1230


def px(w):
    return ((w[0] - X0) * SCALE, (w[1] - Z0) * SCALE)


def pst(s, t):
    return px(world(s, t))


def poly(pts, **attrs):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    a = ' '.join(f"{k.replace('_', '-')}='{v}'" for k, v in attrs.items())
    return f"<polygon points='{d}' {a}/>"


def line(pts, **attrs):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    a = ' '.join(f"{k.replace('_', '-')}='{v}'" for k, v in attrs.items())
    return f"<polyline points='{d}' fill='none' {a}/>"


def text(p, s, size=12, anchor='start', color='#222', font=SANS, weight='normal'):
    return (
        f"<text x='{p[0]:.1f}' y='{p[1]:.1f}' font-size='{size}' text-anchor='{anchor}' fill='{color}' "
        f"{font} font-weight='{weight}'>{s}</text>"
    )


def circle(p, r, **attrs):
    a = ' '.join(f"{k.replace('_', '-')}='{v}'" for k, v in attrs.items())
    return f"<circle cx='{p[0]:.1f}' cy='{p[1]:.1f}' r='{r:.1f}' {a}/>"


def rect_st(s0, s1, t0, t1, **attrs):
    return poly([pst(s0, t0), pst(s1, t0), pst(s1, t1), pst(s0, t1)], **attrs)


def land_outline():
    pts = []
    for i in range(72):
        a = 2 * math.pi * i / 72
        s, t = 400 * math.cos(a), 290 * math.sin(a)
        wob = 1 + 0.04 * math.sin(5 * a) + 0.03 * math.sin(11 * a + 1)
        pts.append(pst(s * wob, t * wob))
    return pts


def cove_outline():
    side = [(-430, -150), (-380, -132), (-330, -112), (-268, -100), (-205, -100), (-176, -92), (-165, -50),
            (-160, 0), (-165, 40), (-182, 62), (-222, 86), (-262, 88), (-300, 118), (-345, 140), (-395, 150),
            (-430, 150), (-470, 160), (-470, -160)]
    return [pst(s, t) for s, t in side]


def ellipse_st(sc, tc, rs, rt, n=36):
    return [pst(sc + rs * math.cos(2 * math.pi * i / n), tc + rt * math.sin(2 * math.pi * i / n)) for i in range(n)]


def top_down():
    o = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>"]
    o.append("<rect width='100%' height='100%' fill='#1d3f63'/>")
    # reef shallows and the cove shelf
    o.append(poly(ellipse_st(-475, 190, 48, 85), fill='#3fb3a8', opacity='0.75'))
    o.append(poly(land_outline(), fill='#3f6b33', stroke='#2a2a24', stroke_width='5'))
    # sea-cliff band hint
    o.append(poly(land_outline(), fill='none', stroke='#2b2620', stroke_width='9', opacity='0.55'))
    o.append(poly(cove_outline(), fill='#2a8fa0'))
    # ridges (knife edges) and the head wall
    o.append(line([pst(s, -205 + 10 * math.sin(s / 60)) for s in range(-340, 330, 10)], stroke='#c9d6b0',
                  stroke_width='3'))
    o.append(line([pst(s, 220 + 10 * math.sin(s / 55)) for s in range(-360, 330, 10)], stroke='#c9d6b0',
                  stroke_width='3'))
    o.append(line([pst(330 + 25 * math.cos(a), 220 * math.sin(a))
                   for a in [math.radians(d) for d in range(-70, 75, 5)]], stroke='#c9d6b0', stroke_width='3'))
    for s, t, name in ((-60, -212, 'Kestrel Peak 262'), (110, 228, 'Anvil 274'), (345, 30, 'Head Wall 240')):
        o.append(circle(pst(s, t), 4, fill='#e8e2c8'))
        o.append(text(pst(s, t + 14), name, 11, color='#eef'))
    # valley floor and river
    o.append(poly([pst(-160, -70), pst(320, -60), pst(320, 80), pst(-160, 70)], fill='#4f7d3a', opacity='0.8'))
    o.append(line([pst(s, 10 + 18 * math.sin(s / 70)) for s in range(310, -170, -10)], stroke='#7fd0e0',
                  stroke_width='3'))
    # hanging valley and its fall to the sea
    o.append(poly([pst(-10, -240), pst(130, -240), pst(130, -285), pst(-10, -285)], fill='#5a8a3c'))
    o.append(line([pst(60, -262), pst(60, -300)], stroke='#ffffff', stroke_width='4'))
    o.append(text(pst(60, -318), 'Hanging Fall (60 m)', 11, color='#eef'))
    # falls: valley head ribbon, Lockfall
    o.append(line([pst(320, 10), pst(260, 10)], stroke='#ffffff', stroke_width='3'))
    o.append(text(pst(300, -30), 'Ribbon Falls (170 m)', 11, color='#eef'))
    o.append(line([pst(-175, 205), pst(-175, 152)], stroke='#ffffff', stroke_width='3'))
    o.append(text(pst(-150, 230), 'Lockfall (120 m)', 11, color='#eef'))
    # beach
    o.append(line([pst(-176, -92), pst(-165, -50), pst(-160, 0), pst(-165, 40)], stroke='#e8d7a0',
                  stroke_width='14'))
    # town, quay, tavern, market
    o.append(rect_st(-330, -150, -190, -112, fill='#b07a55', opacity='0.85'))
    o.append(text(pst(-300, -165), 'Old Town', 12, color='#fff', weight='bold'))
    o.append(rect_st(-330, -200, -110, -100, fill='#8c8573'))
    o.append(circle(pst(*PLACES['lyra'][:2]), 6, fill='#ffb54a'))
    o.append(text(pst(-219, -150), 'The Second Take (tavern)', 11, color='#fff'))
    o.append(circle(pst(*PLACES['market'][:2]), 5, fill='#e2552d'))
    # ship and lane
    o.append(line([pst(-720, -20), pst(-430, -20), pst(-320, -10)], stroke='#ffd08a', stroke_width='2',
                  stroke_dasharray='8,6'))
    o.append(poly(ellipse_st(-320, -10, 45, 45), fill='none', stroke='#ffd08a', stroke_width='1.5',
                  stroke_dasharray='4,4'))
    b = PLACES['berth']
    o.append(poly([pst(b[0] - 18, b[1] - 4), pst(b[0] + 18, b[1] - 4), pst(b[0] + 22, b[1]), pst(b[0] + 18, b[1] + 4),
                   pst(b[0] - 18, b[1] + 4)], fill='#6b4a2e', stroke='#2a1a10'))
    o.append(text(pst(-300, -60), 'berth', 11, color='#ffd08a'))
    # shipyard: basin, drydocks, main slipway
    o.append(rect_st(-222, -150, 92, 150, fill='#3c7f91', stroke='#9a8f78', stroke_width='3'))
    o.append(text(pst(-205, 135), 'Fitting Basin (6 m)', 10, color='#fff'))
    for i, tc in enumerate((102, 122, 142)):
        o.append(rect_st(-150, -95, tc - 7, tc + 7, fill='#7a6a52', stroke='#d8cfb8', stroke_width='1.5'))
        o.append(text(pst(-112, tc + 3), f'DD{i + 1}', 10, color='#fff', weight='bold'))
    o.append(rect_st(-200, -178, 48, 62, fill='#a58a64'))
    o.append(text(pst(-210, 30), 'main slipway', 10, color='#fff'))
    # canal, locks, sea gate, gatehouse
    canal = [(-222, 140), (-262, 140), (-300, 152), (-350, 165), (-395, 180), (-412, 215), (-430, 245)]
    o.append(line([pst(s, t) for s, t in canal], stroke='#3c7f91', stroke_width='9'))
    for s, t, name in ((-250, 140, 'Lock 1'), (-300, 152, 'Lock 2'), (-350, 165, 'Lock 3'),
                       (-398, 182, 'Sea Gate')):
        o.append(circle(pst(s, t), 5, fill='#3fa34d', stroke='#fff'))
        o.append(text(pst(s - 6, t + 18), name, 10, color='#fff'))
    o.append(circle(pst(*PLACES['gateLight'][:2]), 7, fill='#fff1c8', stroke='#ffb54a', stroke_width='2'))
    o.append(text(pst(-430, 120), 'Gate Light', 11, color='#fff1c8', weight='bold'))
    # Wreck Point and the reef wrecks
    o.append(poly([pst(-238, 90), pst(-266, 84), pst(-270, 100), pst(-240, 104)], fill='#6f6a5a'))
    o.append(text(pst(-275, 60), 'Wreck Point', 11, color='#fff'))
    for (s, t), name in (((-468, 160), 'Confident Guess'), ((-492, 210), 'First Take'),
                         ((-462, 246), 'Unchecked')):
        o.append(poly([pst(s - 9, t - 3), pst(s + 9, t - 3), pst(s + 11, t), pst(s + 9, t + 3), pst(s - 9, t + 3)],
                      fill='#4a3a2a', stroke='#000', stroke_width='1'))
        o.append(text(pst(s - 28, t), name, 10, color='#fff'))
    # route
    o.append(line([pst(p[0], p[1]) for _, p in ROUTE], stroke='#ffe066', stroke_width='2.5'))
    o.append(line([pst(p[0], p[1]) for _, p in RING], stroke='#ff9f40', stroke_width='2'))
    o.append(line([pst(p[0], p[1]) for _, p in VALLEY_LOOP], stroke='#ffe066', stroke_width='1.5',
                  stroke_dasharray='5,5'))
    for i, (name, p) in enumerate(ROUTE):
        if name.startswith('Q3'):
            o.append(circle(pst(p[0], p[1]), 7, fill='#ffe066', stroke='#222'))
            o.append(text(pst(p[0], p[1]), name.split()[0][:4], 9, 'middle', '#222', weight='bold'))
    # legend and north arrow
    o.append(text((20, 30), 'Keelhaven (island 03): top-down layout', 18, color='#fff', font=FONT))
    o.append(text((20, 52), 'World x 3300…4400, z −2230…−1230; 1 px = 1 m. Yellow: main path. Orange: Drydock 2 '
                            'ring. Dashed: optional valley loop.', 11, color='#dde'))
    o.append(line([(1050, 120), (1050, 70)], stroke='#fff', stroke_width='2'))
    o.append(poly([(1044, 78), (1050, 66), (1056, 78)], fill='#fff'))
    o.append(text((1050, 140), 'N', 14, 'middle', '#fff', weight='bold'))
    o.append(text((20, 980), 'Wind from 233° (SW). Mouth axis 143°/323°: a beam reach in and out.', 12,
                  color='#ffd08a'))
    o.append('</svg>')
    return '\n'.join(o)


# ---------------------------------------------------------------- the Two Circuits diagram
def two_circuits():
    w, h = 1100, 520
    o = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>"]
    o.append("<rect width='100%' height='100%' fill='#f6f1e4'/>")
    o.append(text((20, 34), 'Two Circuits: what the player does at each station', 20, color='#222', font=FONT))
    # inner ring
    cx, cy, r = 250, 280, 150
    inner = ['Understand', 'Change', 'Inspect', 'Test &amp; Build', 'Preview']
    o.append(circle((cx, cy), r, fill='none', stroke='#3c7f91', stroke_width='6'))
    o.append(text((cx, cy - 8), 'Round 1: the Drydock Ring', 14, 'middle', '#3c7f91', FONT, 'bold'))
    o.append(text((cx, cy + 12), 'on your machine (the cove)', 12, 'middle', '#3c7f91'))
    for i, name in enumerate(inner):
        a = math.radians(-90 + 72 * i)
        p = (cx + r * math.cos(a), cy + r * math.sin(a))
        o.append(circle(p, 30, fill='#fff', stroke='#3c7f91', stroke_width='3'))
        o.append(text((p[0], p[1] + 4), name, 11, 'middle', '#222', weight='bold'))
    o.append(text((cx, cy + 50), 'Bad evidence at any station:', 11, 'middle', '#b23a2a'))
    o.append(text((cx, cy + 64), 'back to Change (repeat)', 11, 'middle', '#b23a2a'))
    # outer chain
    outer = ['Issue', 'Session', 'Diff', 'GATE 1', 'Pull Request', 'Checks', 'GATE 2', 'Merge']
    x0, y0, dx = 470, 280, 80
    for i, name in enumerate(outer):
        x = x0 + dx * i
        gate = name.startswith('GATE')
        o.append(f"<rect x='{x - 34}' y='{y0 - 22}' width='68' height='44' rx='8' fill="
                 f"'{'#ffe9a8' if gate else '#fff'}' stroke='{'#b07a1e' if gate else '#2a6b3a'}' stroke-width='3'/>")
        o.append(text((x, y0 + 4), name, 11, 'middle', '#222', weight='bold'))
        if i:
            o.append(line([(x - dx + 34, y0), (x - 34, y0)], stroke='#2a6b3a', stroke_width='2'))
    o.append(text((x0 + 3.5 * dx, y0 - 60), 'Round 2: the Lock Flight (GitHub)', 14, 'middle', '#2a6b3a', FONT,
                  'bold'))
    o.append(text((x0 + 3.5 * dx, y0 - 42), 'Gates: the captain\'s seal. Human judgment in both loops.', 11,
                  'middle', '#b07a1e'))
    # feedback arrow from Checks back to Session
    xs, xc = x0 + dx * 1, x0 + dx * 5
    o.append(line([(xc, y0 + 22), (xc, y0 + 80), (xs, y0 + 80), (xs, y0 + 22)], stroke='#b23a2a',
                  stroke_width='2', stroke_dasharray='6,4'))
    o.append(text(((xs + xc) / 2, y0 + 98), 'A chalk note or a red lamp: back to the drydock for one focused '
                                            'change', 11, 'middle', '#b23a2a'))
    o.append(text((x0 + 7 * dx, y0 + 50), 'stays shut for', 10, 'middle', '#555'))
    o.append(text((x0 + 7 * dx, y0 + 63), 'practice hulls', 10, 'middle', '#555'))
    o.append(text((20, h - 20), 'Course: 03 §Inner Loop, §Outer Loop, §Core Concept (development-loop, '
                                'issue-to-merged-pr). The diagram is ours; no course art is copied.', 11,
                  color='#444'))
    o.append('</svg>')
    return '\n'.join(o)


if __name__ == '__main__':
    report()
    with open(os.path.join(HERE, 'top-down-layout.svg'), 'w') as f:
        f.write(top_down())
    with open(os.path.join(HERE, 'two-circuits.svg'), 'w') as f:
        f.write(two_circuits())
    print('\nWrote top-down-layout.svg and two-circuits.svg')
