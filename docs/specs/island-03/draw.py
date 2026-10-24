#!/usr/bin/env python3
"""Draws the Island 03 (Keelhaven) concept diagrams from the spec's numbers
(docs/specs/ISLAND-03-keelhaven.md) and prints the world positions, walking distances, bounds and
headings that the spec's tables use.

Run: python3 docs/specs/island-03/draw.py  (writes top-down-layout.svg and two-circuits.svg next to
this file). Hand-drawn vector diagrams only: no AI art, no reference-renderer code.

Island frame: every place is given as (s, t, y). s is metres along the cove axis U (bearing 143°, from
the harbour mouth toward the valley head), t is metres along V (bearing 53°, toward the north-east
ridge), both from the island centre C. y is the height above the sea. World: x east, z south (-z is
north), as in the game's code. A bearing is degrees clockwise from north.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
C = (3800.0, -1650.0)
U = (math.sin(math.radians(143)), -math.cos(math.radians(143)))  # (0.6018, 0.7986)
V = (math.sin(math.radians(53)), -math.cos(math.radians(53)))  # (0.7986, -0.6018)
TB_CENTRE = (2050.0, -1500.0)
TB_BERTH = (1931.35, -1372.0)
TB_UNLOAD = 1350.0
WALK_SPEED = 1.8  # m/s, the speed the learning-journey review measured
SERIF = "font-family='Georgia, serif'"
SANS = "font-family='Helvetica, Arial, sans-serif'"


def world(s, t):
    return (C[0] + s * U[0] + t * V[0], C[1] + s * U[1] + t * V[1])


def bearing_of(a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    return math.degrees(math.atan2(dx, -dz)) % 360


def heading_toward(a, b):
    """The code's heading h (a body faces (sin h, cos h)) from world point a toward b."""
    return math.atan2(b[0] - a[0], b[1] - a[1])


def heading_of_bearing(deg):
    return math.atan2(math.sin(math.radians(deg)), -math.cos(math.radians(deg)))


# ------------------------------------------------------------------ the coast (island frame)
# Outer coast, clockwise from the South Head's inner corner at the mouth, round the south-east, to the
# North Head's inner corner. The cove is the bite between the two corners.
OUTER = [
    (-470, -62), (-492, -100), (-478, -170), (-436, -232), (-362, -274), (-262, -296), (-140, -304),
    (-20, -300), (60, -306), (140, -300), (250, -284), (340, -238), (400, -150), (420, -40), (412, 80),
    (372, 180), (300, 250), (190, 290), (60, 304), (-80, 300), (-220, 294), (-340, 278), (-432, 246),
    (-486, 204), (-508, 160), (-498, 132), (-494, 116), (-484, 92), (-470, 55),
]
# The cove's shore, from the North Head's inner corner back in along the north-east shore (the spit),
# round the beach at the cove head, and out along the Old Town quay to the South Head's corner.
COVE = [
    (-470, 55), (-420, 60), (-360, 64), (-300, 68), (-190, 68), (-172, 60), (-162, 32), (-158, 0),
    (-162, -40), (-174, -80), (-192, -110), (-215, -125), (-330, -125), (-382, -114), (-430, -92),
    (-470, -62),
]
REEF = (-562, 190, 46, 82)  # centre s, t and half-axes: the reef flat off the North Head
WRECKS = [((-548, 142), 'Confident Guess'), ((-578, 196), 'First Take'), ((-552, 246), 'Unchecked')]
PEAKS = [((-400, -222), 'South Head', 110), ((-60, -214), 'Kestrel Peak', 262),
         ((110, 222), 'Anvil', 274), ((330, 0), 'Head Wall', 240), ((-380, 222), 'North Head', 120)]

# The shipyard (y 7 terrace) and the canal
BASIN = (-245, -175, 85, 150)  # s0, s1, t0, t1 (water y 6)
DOCKS = [('DD1', 99.0), ('DD2', 120.0), ('DD3', 141.0)]  # centre t; each 14 m wide
DOCK_S = (-175.0, -135.0)  # caisson end, head end (40 m long)
CANAL_T = 125.0
LOCKS = [('Lock 1', -255, -280), ('Lock 2', -305, -330), ('Lock 3', -355, -380)]
SEA_GATE_S = -470.0

PLACES = {  # (s, t, y)
    'berth': (-275.0, -120.35, 0.0),
    'landing': (-270.0, -129.5, 2.2),
    'market (Bram)': (-292.0, -134.0, 2.2),
    'lyra': (-212.0, -141.0, 2.8),
    'hester': (-167.0, -12.0, 2.2),
    'shipyard gate': (-128.0, 82.0, 7.0),
    'dory': (-128.0, 99.0, 7.0),
    'cass': (-128.0, 116.0, 7.0),
    'ring: Understand (work-order post)': (-131.0, 120.0, 7.0),
    'ring: Change (plank stack)': (-148.0, 130.5, 7.0),
    'ring: Inspect (the slate)': (-165.0, 130.5, 7.0),
    'ring: Test & Build (caisson)': (-180.0, 120.0, 7.0),
    'ring: Preview (lookout)': (-165.0, 109.5, 7.0),
    'barty': (-215.0, 166.0, 7.0),
    'stroud': (-262.0, 141.0, 7.0),
    'arlo': (-318.0, 140.0, 5.0),
    'repair barge': (-345.0, 125.0, 2.0),
    'ottoline': (-462.0, 146.0, 10.0),
    'gate light (tower)': (-470.0, 154.0, 32.0),
    'falls pool': (255.0, 10.0, 48.0),
    'old hulk': (-222.0, 172.0, 7.0),
}

STATIONS = [  # anchor, (s, t, y), look target (s, t, y)
    ('landing', (-270.0, -129.5, 2.2), (-212.0, -141.0, 3.4)),
    ('bram', (-292.0, -134.0, 2.4), (-270.0, -129.5, 3.4)),
    ('lyra', (-212.0, -141.0, 2.8), (-222.0, -131.0, 3.4)),
    ('hester', (-167.0, -12.0, 2.2), (-168.0, -46.0, 3.4)),
    ('evidenceBoard', (-171.0, -4.0, 2.2), (-167.0, -12.0, 3.4)),
    ('dory', (-128.0, 99.0, 7.0), (-128.0, 82.0, 8.2)),
    ('cass', (-128.0, 116.0, 7.0), (-128.0, 99.0, 8.2)),
    ('ringPost', (-131.0, 120.0, 7.0), (-160.0, 120.0, 7.0)),
    ('ringStack', (-148.0, 130.5, 7.0), (-148.0, 120.0, 7.0)),
    ('ringSlate', (-165.0, 130.5, 7.0), (-165.0, 120.0, 7.0)),
    ('ringCaisson', (-180.0, 120.0, 7.0), (-160.0, 120.0, 7.0)),
    ('ringLookout', (-165.0, 109.5, 11.0), (-215.0, 118.0, 6.0)),
    ('ringCam', (-108.0, 98.0, 24.0), (-160.0, 120.0, 7.0)),
    ('barty', (-215.0, 166.0, 7.0), (-175.0, 158.0, 8.2)),
    ('stroud', (-262.0, 141.0, 7.0), (-215.0, 166.0, 8.2)),
    ('ledgers', (-266.0, 147.0, 7.0), (-262.0, 141.0, 8.2)),
    ('lock1Slate', (-268.0, 134.0, 7.0), (-268.0, 125.0, 6.0)),
    ('gate1', (-280.0, 134.0, 7.0), (-280.0, 125.0, 6.0)),
    ('petitionMast', (-256.0, 149.0, 7.0), (-262.0, 141.0, 8.2)),
    ('lockCam', (-238.0, 172.0, 22.0), (-330.0, 128.0, 4.0)),
    ('arlo', (-318.0, 140.0, 5.0), (-292.0, 140.0, 6.2)),
    ('barge', (-345.0, 125.0, 2.0), (-318.0, 140.0, 6.2)),
    ('gate2', (-382.0, 134.0, 3.0), (-382.0, 125.0, 1.0)),
    ('ottoline', (-462.0, 146.0, 10.0), (-450.0, 140.0, 4.2)),
    ('extraKids', (-176.0, 52.0, 1.2), (-160.0, 45.0, 2.6)),
    ('extraCaulker', (-150.0, 133.0, 7.0), (-150.0, 120.0, 7.0)),
    ('extraFisher', (-182.0, -72.0, 1.4), (-260.0, -40.0, 0.0)),
    ('extraLamplighter', (-368.0, 146.0, 3.0), (-368.0, 125.0, 1.0)),
    ('extraTug', (-372.0, 125.0, 0.6), (-382.0, 125.0, 0.6)),
]

ROUTE = [  # the main path, in the chapter's order
    ('Landing (Old Town quay)', (-270.0, -129.5, 2.2)),
    ('quay, tavern corner', (-222.0, -131.0, 2.2)),
    ('Q3.1 Lyra, tavern porch', (-212.0, -141.0, 2.8)),
    ('beach, south-west end', (-186.0, -96.0, 1.6)),
    ('beach, middle', (-168.0, -46.0, 1.4)),
    ('Q3.2 Hester, Evidence Board by the river bridge', (-167.0, -12.0, 2.2)),
    ('river bridge', (-164.0, 2.0, 2.2)),
    ('slipway head', (-160.0, 45.0, 2.6)),
    ('shipyard gate (ramp top)', (-128.0, 82.0, 7.0)),
    ('Q3.3 Dory, Drydock 1 head', (-128.0, 99.0, 7.0)),
    ('Q3.4-Q3.5 Cass, Drydock 2 head', (-128.0, 116.0, 7.0)),
    ('Drydock 3 head', (-128.0, 156.0, 7.0)),
    ('basin north-east corner', (-175.0, 158.0, 7.0)),
    ('Q3.6 Barty, the Old Hulk', (-215.0, 166.0, 7.0)),
    ('Q3.7-Q3.8 Stroud, Lock 1 office', (-262.0, 141.0, 7.0)),
    ('towpath, below Lock 1', (-292.0, 140.0, 5.0)),
    ('Q3.9 Arlo, Lock 2', (-318.0, 140.0, 5.0)),
    ('towpath, Lock 3', (-368.0, 140.0, 3.0)),
    ('rock cut', (-420.0, 140.0, 3.0)),
    ('gatehouse stair foot', (-450.0, 140.0, 3.0)),
    ('Q3.10 Ottoline, gatehouse deck', (-462.0, 146.0, 10.0)),
]

RING = [  # Two Circuits round 1, one lap round Drydock 2 (walk anticlockwise seen from above)
    ('Understand: work-order post at the dock head', (-131.0, 120.0, 7.0)),
    ('north-east wall', (-131.0, 130.5, 7.0)),
    ('Change: plank stack', (-148.0, 130.5, 7.0)),
    ('Inspect: the slate', (-165.0, 130.5, 7.0)),
    ('caisson, north', (-180.0, 130.5, 7.0)),
    ('Test & Build: the caisson', (-180.0, 120.0, 7.0)),
    ('caisson, south', (-180.0, 109.5, 7.0)),
    ('Preview: the lookout', (-165.0, 109.5, 7.0)),
    ('south-west wall, dock head', (-131.0, 109.5, 7.0)),
    ('Understand (lap done)', (-131.0, 120.0, 7.0)),
]

VALLEY_LOOP = [  # optional: from the shipyard's back gate up the north-east bank, back down the south-west bank
    ('shipyard back gate', (-112.0, 92.0, 7.0)),
    ('north-east bank', (40.0, 60.0, 18.0)),
    ('ford', (150.0, 20.0, 34.0)),
    ('Falls Pool', (255.0, 10.0, 48.0)),
    ('south-west bank', (100.0, -45.0, 28.0)),
    ('valley mouth', (-60.0, -50.0, 8.0)),
    ('river bridge', (-164.0, 2.0, 2.2)),
]

ARRIVAL = [  # flyover keys: camera (s, t, y) -> target (s, t, y)
    ('1 the whole island', (-900.0, -160.0, 26.0), (0.0, 0.0, 120.0)),
    ('2 into the mouth', (-575.0, -12.0, 16.0), (-275.0, -120.0, 6.0)),
    ('3 over the cove', (-330.0, 10.0, 30.0), (-150.0, 120.0, 12.0)),
    ('4 up the valley', (-110.0, 10.0, 62.0), (330.0, 10.0, 150.0)),
    ('5 along the lock flight', (-190.0, 205.0, 70.0), (-470.0, 154.0, 26.0)),
    ('6 down to the captain', (-238.0, -84.0, 14.0), (-270.0, -129.5, 4.0)),
]


def dist3(a, b):
    pa, pb = world(a[0], a[1]), world(b[0], b[1])
    return math.dist((pa[0], a[2], pa[1]), (pb[0], b[2], pb[1]))


def walk(points):
    total, rows = 0.0, []
    for i, (name, p) in enumerate(points):
        leg = 0.0 if i == 0 else dist3(points[i - 1][1], p)
        total += leg
        w = world(p[0], p[1])
        rows.append((name, w, p[2], leg, total))
    return rows


def fmt(w, y):
    return f'({w[0]:7.1f}, {y:5.1f}, {w[1]:8.1f})'


def report():
    land = [world(s, t) for s, t in OUTER]
    xs, zs = [p[0] for p in land], [p[1] for p in land]
    print(f'Land AABB: x {min(xs):.0f}…{max(xs):.0f}, z {min(zs):.0f}…{max(zs):.0f}')
    m = 110.0
    bx0, bx1 = math.floor((min(xs) - m) / 20) * 20, math.ceil((max(xs) + m) / 20) * 20
    bz0, bz1 = math.floor((min(zs) - m) / 20) * 20, math.ceil((max(zs) + m) / 20) * 20
    print(f'Bake bounds (land + {m:.0f} m, to 20 m): x {bx0}…{bx1}, z {bz0}…{bz1}; '
          f'{(bx1 - bx0) // 2 + 1} × {(bz1 - bz0) // 2 + 1} samples at 2 m')
    near = min(land, key=lambda p: math.dist(p, TB_CENTRE))
    print(f'Nearest land to Thousand-Bough centre: {math.dist(near, TB_CENTRE):.0f} m (its unload: {TB_UNLOAD:.0f})')
    reef = world(REEF[0] - REEF[2], REEF[1])
    print(f'Reef west edge to TB centre: {math.dist(reef, TB_CENTRE):.0f} m')
    print(f'TB berth to Keelhaven centre: {math.dist(TB_BERTH, C):.0f} m')
    print(f'Mouth (s -470, t 0) world: {fmt(world(-470, 0), 0)}; lane start (s -800, t 0): {fmt(world(-800, 0), 0)}')
    print(f'TB centre → lane start bearing: {bearing_of(TB_CENTRE, world(-800, 0)):.0f}°')
    print('\nPlaces (x, y, z):')
    for k, (s, t, y) in PLACES.items():
        print(f'  {k:38s} {fmt(world(s, t), y)}')
    for title, pts in (('Main route', ROUTE), ('Drydock 2 ring (one lap)', RING), ('Valley loop', VALLEY_LOOP)):
        print(f'\n{title}:')
        for name, w, y, leg, total in walk(pts):
            print(f'  {name:46s} {fmt(w, y)}  leg {leg:6.1f}  total {total:6.1f}')
        print(f'  walking time at {WALK_SPEED} m/s: {walk(pts)[-1][4] / WALK_SPEED / 60:.1f} min')
    land_pt = world(*PLACES['landing'][:2])
    berth = world(*PLACES['berth'][:2])
    print('\nHeadings:')
    print(f'  berth (bow to the mouth, bearing 323°): {heading_of_bearing(323):.3f} rad')
    print(f"  landing, facing Lyra: {heading_toward(land_pt, world(*PLACES['lyra'][:2])):.3f} rad")
    print(f'  berth to landing: {math.dist(berth, land_pt):.1f} m')
    for k in ('hester', 'dory', 'ottoline', 'gate light (tower)', 'falls pool'):
        print(f'  bearing landing → {k:20s} {bearing_of(land_pt, world(*PLACES[k][:2])):6.1f}°, '
              f'{math.dist(land_pt, world(*PLACES[k][:2])):5.0f} m')
    print('\nStations (anchor, position x y z, heading toward the look target, look target):')
    for name, p, look in STATIONS:
        wp, wl = world(p[0], p[1]), world(look[0], look[1])
        print(f'  {name:16s} {fmt(wp, p[2])}  h {heading_toward(wp, wl):6.2f}  → {fmt(wl, look[2])}')
    print('\nArrival flyover keys (camera → target):')
    for name, cam, tgt in ARRIVAL:
        print(f'  {name:26s} {fmt(world(cam[0], cam[1]), cam[2])} → {fmt(world(tgt[0], tgt[1]), tgt[2])}')
    print('\nWrecks (x, z):')
    for (s, t), name in WRECKS:
        w = world(s, t)
        print(f'  {name:16s} ({w[0]:7.1f}, {w[1]:8.1f})')


# ------------------------------------------------------------------ SVG helpers
W, H = 1100, 1100
X0, Z0, SCALE = 3220.0, -2330.0, 1.0  # world box x 3220…4320, z −2330…−1230; 1 px = 1 m


def px(w):
    return ((w[0] - X0) * SCALE, (w[1] - Z0) * SCALE)


def pst(s, t):
    return px(world(s, t))


def attrs(a):
    return ' '.join(f"{k.replace('_', '-')}='{v}'" for k, v in a.items())


def poly(pts, **a):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return f"<polygon points='{d}' {attrs(a)}/>"


def line(pts, **a):
    d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
    return f"<polyline points='{d}' fill='none' {attrs(a)}/>"


def text(p, s, size=12, anchor='start', color='#222', font=SANS, weight='normal'):
    return (f"<text x='{p[0]:.1f}' y='{p[1]:.1f}' font-size='{size}' text-anchor='{anchor}' fill='{color}' "
            f"{font} font-weight='{weight}'>{s}</text>")


def circle(p, r, **a):
    return f"<circle cx='{p[0]:.1f}' cy='{p[1]:.1f}' r='{r:.1f}' {attrs(a)}/>"


def rect_st(s0, s1, t0, t1, **a):
    return poly([pst(s0, t0), pst(s1, t0), pst(s1, t1), pst(s0, t1)], **a)


def ellipse_st(sc, tc, rs, rt, n=40):
    return [pst(sc + rs * math.cos(2 * math.pi * i / n), tc + rt * math.sin(2 * math.pi * i / n)) for i in range(n)]


def land_polygon():
    return [pst(s, t) for s, t in OUTER] + [pst(s, t) for s, t in COVE[1:-1]]


# ------------------------------------------------------------------ top-down layout
def top_down():
    o = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' viewBox='0 0 {W} {H}'>",
         "<rect width='100%' height='100%' fill='#1b3a5c'/>"]
    # shallows: reef and cove shelf (turquoise only over sand and reef)
    o.append(poly(ellipse_st(*REEF), fill='#3fb3a8', opacity='0.8'))
    o.append(poly([pst(s, t) for s, t in COVE], fill='#2fa39a'))
    # land, with the dark sea-cliff band on the outer coast
    o.append(poly(land_polygon(), fill='#3c6e34'))
    o.append(line([pst(s, t) for s, t in OUTER], stroke='#2b2620', stroke_width='7'))
    # ridges (knife edges) and the amphitheatre head wall
    o.append(line([pst(s, -214 + 8 * math.sin(s / 50)) for s in range(-440, 300, 10)], stroke='#d7e2bd',
                  stroke_width='2.5'))
    o.append(line([pst(s, 220 + 8 * math.sin(s / 45)) for s in range(-400, 300, 10)], stroke='#d7e2bd',
                  stroke_width='2.5'))
    o.append(line([pst(320 + 22 * math.cos(a), 218 * math.sin(a))
                   for a in [math.radians(d) for d in range(-80, 85, 5)]], stroke='#d7e2bd', stroke_width='2.5'))
    for (s, t), name, h in PEAKS:
        o.append(circle(pst(s, t), 4, fill='#f2ecd2'))
        o.append(text(pst(s + 18, t), f'{name} {h}', 10, color='#f2f2f2'))
    # valley floor, river and Ribbon Falls
    o.append(poly([pst(-150, -95), pst(280, -70), pst(280, 85), pst(-120, 75)], fill='#4c7d38', opacity='0.85'))
    o.append(line([pst(s, 4 + 14 * math.sin(s / 60)) for s in range(262, -160, -8)], stroke='#86d4e2',
                  stroke_width='3'))
    o.append(circle(pst(255, 10), 9, fill='#86d4e2'))
    o.append(line([pst(318, 8), pst(266, 9)], stroke='#ffffff', stroke_width='3.5'))
    o.append(text(pst(300, -60), 'Ribbon Falls (190 m)', 10, color='#f2f2f2'))
    # hanging valley and its fall into the sea
    o.append(poly([pst(10, -235), pst(140, -238), pst(140, -290), pst(10, -288)], fill='#5d8f3f'))
    o.append(line([pst(72, -298), pst(72, -318)], stroke='#ffffff', stroke_width='4'))
    o.append(text(pst(90, -345), 'Hanging Valley · Hanging Fall (55 m, to the sea)', 10, color='#f2f2f2'))
    # Lockfall (feeds the lock flight)
    o.append(line([pst(-250, 206), pst(-250, 176)], stroke='#ffffff', stroke_width='3'))
    o.append(text(pst(-246, 232), 'Lockfall (85 m)', 10, color='#f2f2f2'))
    # beach
    o.append(line([pst(-192, -110), pst(-174, -80), pst(-162, -40), pst(-158, 0), pst(-162, 32)],
                  stroke='#ecdca4', stroke_width='12'))
    # Old Town, quay, tavern, market
    o.append(rect_st(-345, -195, -212, -138, fill='#a8744f', opacity='0.9'))
    o.append(text(pst(-318, -190), 'Old Town', 13, color='#fff', weight='bold'))
    o.append(rect_st(-335, -205, -138, -125, fill='#8c8573'))
    o.append(circle(pst(*PLACES['lyra'][:2]), 5, fill='#ffb54a'))
    o.append(text(pst(-196, -170), 'The Second Take', 10, color='#fff'))
    o.append(circle(pst(*PLACES['market (Bram)'][:2]), 4, fill='#e2552d'))
    # approach lane, turning circle and the ship
    o.append(line([pst(-800, 0), pst(-470, 0), pst(-330, -40)], stroke='#ffd08a', stroke_width='2',
                  stroke_dasharray='8,6'))
    o.append(poly(ellipse_st(-330, -40, 45, 45), fill='none', stroke='#ffd08a', stroke_width='1.5',
                  stroke_dasharray='4,4'))
    b = PLACES['berth']
    o.append(poly([pst(b[0] + 18, b[1] - 4), pst(b[0] - 18, b[1] - 4), pst(b[0] - 23, b[1]),
                   pst(b[0] - 18, b[1] + 4), pst(b[0] + 18, b[1] + 4)], fill='#6b4a2e', stroke='#2a1a10'))
    o.append(text(pst(-330, -88), 'berth', 10, color='#ffd08a'))
    o.append(text(pst(-700, 30), 'approach lane 143°', 10, color='#ffd08a'))
    # shipyard: terrace, slipway, basin, drydocks, sheerlegs
    o.append(rect_st(-260, -112, 72, 172, fill='#9d927c'))
    o.append(rect_st(-200, -160, 50, 66, fill='#b89c70'))
    o.append(text(pst(-205, 30), 'slipway', 9, color='#fff'))
    o.append(rect_st(BASIN[0], BASIN[1], BASIN[2], BASIN[3], fill='#3c7f91'))
    o.append(text(pst(-238, 104), 'Fitting Basin', 9, color='#fff'))
    for name, tc in DOCKS:
        o.append(rect_st(DOCK_S[0], DOCK_S[1], tc - 7, tc + 7, fill='#6f5f48', stroke='#e0d6be',
                         stroke_width='1'))
        o.append(text(pst(-150, tc + 3), name, 8, color='#fff', weight='bold'))
    o.append(circle(pst(-122, 128), 4, fill='#f2ecd2'))
    o.append(text(pst(-112, 128), 'sheerlegs', 9, color='#fff'))
    # canal, locks, sea gate, gatehouse, Gate Light
    o.append(line([pst(BASIN[0], CANAL_T), pst(SEA_GATE_S - 25, CANAL_T)], stroke='#3c7f91', stroke_width='10'))
    for name, s0, s1 in LOCKS:
        o.append(rect_st(s1, s0, CANAL_T - 6, CANAL_T + 6, fill='#4d93a6', stroke='#e0d6be', stroke_width='1'))
        o.append(circle(pst((s0 + s1) / 2, CANAL_T + 11), 3.5, fill='#3fa34d', stroke='#fff'))
        o.append(text(pst((s0 + s1) / 2, CANAL_T - 20), name, 9, 'middle', '#fff'))
    o.append(rect_st(SEA_GATE_S - 3, SEA_GATE_S + 3, CANAL_T - 7, CANAL_T + 7, fill='#d7c08a'))
    o.append(text(pst(SEA_GATE_S, CANAL_T - 26), 'Sea Gate', 10, 'middle', '#fff'))
    o.append(circle(pst(*PLACES['gate light (tower)'][:2]), 7, fill='#fff1c8', stroke='#ffb54a', stroke_width='2'))
    o.append(text(pst(-470, 186), 'Gate Light', 12, 'middle', '#fff1c8', weight='bold'))
    # wrecks on the reef
    for (s, t), name in WRECKS:
        o.append(poly([pst(s - 9, t - 3), pst(s + 9, t - 3), pst(s + 12, t), pst(s + 9, t + 3), pst(s - 9, t + 3)],
                      fill='#4a3a2a', stroke='#000', stroke_width='1'))
        o.append(text(pst(s - 40, t), name, 9, 'middle', '#fff'))
    # the Old Hulk (Barty's)
    o.append(poly([pst(-232, 168), pst(-212, 168), pst(-208, 172), pst(-212, 176), pst(-232, 176)], fill='#5c4630'))
    # routes
    o.append(line([pst(p[0], p[1]) for _, p in VALLEY_LOOP], stroke='#ffe066', stroke_width='1.5',
                  stroke_dasharray='5,5'))
    o.append(line([pst(p[0], p[1]) for _, p in ROUTE], stroke='#ffe066', stroke_width='2.5'))
    o.append(line([pst(p[0], p[1]) for _, p in RING], stroke='#ff9f40', stroke_width='2'))
    for name, p in ROUTE:
        if name.startswith('Q3'):
            o.append(circle(pst(p[0], p[1]), 6.5, fill='#ffe066', stroke='#222'))
    labels = [('Q3.1', -212, -141, 14, 16), ('Q3.2', -167, -12, -40, 4), ('Q3.3', -128, 99, 14, 4),
              ('Q3.4–5', -128, 116, 14, 4), ('Q3.6', -215, 166, 0, 22), ('Q3.7–8', -262, 141, 0, 24),
              ('Q3.9', -318, 140, 0, 24), ('Q3.10', -462, 146, 30, -6)]
    for lab, s, t, ox, oy in labels:
        x, y = pst(s, t)
        o.append(text((x + ox, y + oy), lab, 10, 'middle', '#ffe066', weight='bold'))
    # legend and north arrow
    o.append(text((20, 30), 'Keelhaven (island 03): top-down layout', 18, color='#fff', font=SERIF))
    o.append(text((20, 50), 'World x 3220…4320, z −2330…−1230; 1 px = 1 m; north up. Yellow: main path in the '
                            "chapter's order. Orange: one lap of the Drydock Ring. Dashed: optional valley loop.",
                  10.5, color='#dde'))
    o.append(line([(1040, 120), (1040, 72)], stroke='#fff', stroke_width='2'))
    o.append(poly([(1034, 80), (1040, 68), (1046, 80)], fill='#fff'))
    o.append(text((1040, 140), 'N', 14, 'middle', '#fff', weight='bold'))
    o.append(text((20, H - 18), 'Wind from 233° (SW). Mouth axis 143°/323°: a beam reach in and out. '
                                'Dark rim: the basalt sea-cliff band.', 11, color='#ffd08a'))
    o.append('</svg>')
    return '\n'.join(o)


# ------------------------------------------------------------------ the Two Circuits diagram
def two_circuits():
    w, h = 1180, 560
    o = [f"<svg xmlns='http://www.w3.org/2000/svg' width='{w}' height='{h}' viewBox='0 0 {w} {h}'>",
         "<rect width='100%' height='100%' fill='#f6f1e4'/>",
         text((20, 34), 'Two Circuits: what the player does at each station', 20, color='#222', font=SERIF)]
    cx, cy, r = 230, 300, 140
    inner = [('Understand', 'pick the plan'), ('Change', 'crew fits planks'), ('Inspect', 'read the slate'),
             ('Test &amp; Build', 'hammer + float'), ('Preview', 'choose the check')]
    o.append(circle((cx, cy), r, fill='none', stroke='#3c7f91', stroke_width='6'))
    o.append(text((cx, cy - r - 62), 'Round 1: the Drydock Ring', 14, 'middle', '#3c7f91', SERIF, 'bold'))
    o.append(text((cx, cy - r - 44), 'on your machine (the cove)', 11, 'middle', '#3c7f91'))
    o.append(text((cx, cy + 14), 'lap 1: the fix · lap 2: the test', 11, 'middle', '#3c7f91'))
    o.append(text((cx, cy + 40), 'Bad evidence at a station:', 11, 'middle', '#b23a2a'))
    o.append(text((cx, cy + 54), 'back to Change (repeat)', 11, 'middle', '#b23a2a'))
    for i, (name, sub) in enumerate(inner):
        a = math.radians(-90 + 72 * i)
        p = (cx + r * math.cos(a), cy + r * math.sin(a))
        o.append(circle(p, 38, fill='#fff', stroke='#3c7f91', stroke_width='3'))
        o.append(text((p[0], p[1] - 2), name, 11, 'middle', '#222', weight='bold'))
        o.append(text((p[0], p[1] + 12), sub, 9, 'middle', '#555'))
    # the caisson seal (inner-loop judgment)
    o.append(f"<rect x='{cx - 70}' y='{cy + r + 46}' width='140' height='34' rx='8' fill='#ffe9a8' "
             f"stroke='#b07a1e' stroke-width='3'/>")
    o.append(text((cx, cy + r + 68), 'Your seal: ready?', 11, 'middle', '#222', weight='bold'))
    outer = [('Issue', 'the ledger'), ('Session', 'choose the start'), ('Diff', 'the slate'),
             ('GATE 1', 'your seal'), ('Pull Request', 'honest petition'), ('Checks', 'Lockfall lamps'),
             ('GATE 2', 'all agree?'), ('Merge', 'stays shut')]
    x0, y0, dx = 480, 300, 88
    for i, (name, sub) in enumerate(outer):
        x = x0 + dx * i
        gate = name.startswith('GATE')
        o.append(f"<rect x='{x - 40}' y='{y0 - 26}' width='80' height='52' rx='8' "
                 f"fill='{'#ffe9a8' if gate else '#fff'}' stroke='{'#b07a1e' if gate else '#2a6b3a'}' stroke-width='3'/>")
        o.append(text((x, y0 - 2), name, 11, 'middle', '#222', weight='bold'))
        o.append(text((x, y0 + 13), sub, 9, 'middle', '#555'))
        if i:
            o.append(line([(x - dx + 40, y0), (x - 40, y0)], stroke='#2a6b3a', stroke_width='2'))
    o.append(text((x0 + 3.5 * dx, y0 - 76), 'Round 2: the Lock Flight (on GitHub)', 14, 'middle', '#2a6b3a', SERIF,
                  'bold'))
    o.append(text((x0 + 3.5 * dx, y0 - 56), 'Human judgment in both loops: your seal at the caisson, Gate 1 and Gate 2.',
                  11, 'middle', '#b07a1e'))
    xs, xc = x0 + dx * 1, x0 + dx * 5
    o.append(line([(xc, y0 + 26), (xc, y0 + 86), (xs, y0 + 86), (xs, y0 + 26)], stroke='#b23a2a',
                  stroke_width='2', stroke_dasharray='6,4'))
    o.append(text(((xs + xc) / 2, y0 + 104), 'A chalk note or a red lamp: the repair barge (a new session) makes one '
                                            'focused change, then checks run again', 10.5, 'middle', '#b23a2a'))
    o.append(text((x0 + 7 * dx, y0 + 50), 'practice hulls', 10, 'middle', '#555'))
    o.append(text((x0 + 7 * dx, y0 + 63), 'wait in the basin', 10, 'middle', '#555'))
    o.append(text((20, h - 20), "Course: 03 §Inner Loop, §Outer Loop, §Core Concept (the development-loop and "
                                "issue-to-merged-pr diagrams). Our own drawing: no course art is copied.", 11,
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
