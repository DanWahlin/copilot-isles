#!/usr/bin/env python3
"""Draws the Island 02 concept diagrams from the spec's numbers (docs/specs/ISLAND-02-thousand-bough.md).

Run: python3 docs/specs/island-02/draw.py  (writes the three SVGs next to this file and prints the
Channel Routing solution counts). Hand-drawn vector diagrams only; no AI art.
"""
import itertools
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
T = (2010.0, -1560.0)
FONT = "font-family='Georgia, serif'"
SANS = "font-family='Helvetica, Arial, sans-serif'"
CREW = {"F": "#3B82F6", "G": "#3FA34D", "T": "#1EA7A7"}


def bearing(b, r, p=T):
    a = math.radians(b)
    return (p[0] + r * math.sin(a), p[1] - r * math.cos(a))


def helix_y(theta):
    return 18.5 + 12 * theta / 360


# ---------------------------------------------------------------- Channel Routing solver
D = [(-1, 0), (0, 1), (1, 0), (0, -1)]  # N E S W (row 0 = north)


def paths(grid, start, goal):
    out = []
    R, C = len(grid), len(grid[0])

    def dfs(r, c, move, cells):
        if r == R:
            if c == goal:
                out.append(tuple(cells))
            return
        if r < 0 or c < 0 or c >= C:
            return
        t = grid[r][c]
        if t == "R" or (r, c) in cells:
            return
        nexts = [move] if t == "S" else [(move + 1) % 4, (move + 3) % 4]
        for m in nexts:
            dfs(r + D[m][0], c + D[m][1], m, cells + [(r, c)])

    dfs(0, start, 2, [])
    return out


def solutions(grid, pairs):
    ps = [paths(grid, s, g) for s, g in pairs]
    sols = []
    for combo in itertools.product(*ps):
        cells = [x for p in combo for x in p]
        if len(cells) == len(set(cells)):
            sols.append(combo)
    return sols


BOARD_A = ["LLSLL", "SRSRS", "SLSLS", "SSSSS"]
BOARD_B = ["LLSLL", "SLLLS", "SSRLL", "SLLLL"]
PAIRS = [(1, 0), (2, 2), (3, 4)]  # Feature c1→c0, Bug Fix c2→c2, Docs c3→c4
START_A = [[3, 0, 0, 3, 0], [1, 0, 0, 0, 1], [0, 0, 0, 3, 0], [0, 0, 0, 0, 0]]


def rotations_for(path):
    """Elbow rot 0=N–E 1=E–S 2=S–W 3=W–N; straight 0=N–S 1=E–W, from a path's cells."""
    rots = {}
    prev_dir = 2  # entering the first tile moving south (from the north)
    for i, (r, c) in enumerate(path):
        if i + 1 < len(path):
            nr, nc = path[i + 1]
            out_dir = D.index((nr - r, nc - c))
        else:
            out_dir = 2
        came_from = (prev_dir + 2) % 4
        sides = {came_from, out_dir}
        if sides == {0, 2}:
            rots[(r, c)] = 0
        elif sides == {1, 3}:
            rots[(r, c)] = 1
        else:
            rots[(r, c)] = {frozenset({0, 1}): 0, frozenset({1, 2}): 1, frozenset({2, 3}): 2, frozenset({3, 0}): 3}[
                frozenset(sides)
            ]
        prev_dir = out_dir
    return rots


# ---------------------------------------------------------------- SVG helpers
def svg(w, h, body, title):
    return (
        f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' width='{w}' height='{h}'>\n"
        f"<title>{title}</title>\n<rect width='{w}' height='{h}' fill='#F6F1E4'/>\n" + body + "\n</svg>\n"
    )


def text(x, y, s, size=11, fill="#2B2A26", anchor="start", weight="normal", font=SANS):
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<text x='{x:.1f}' y='{y:.1f}' font-size='{size}' fill='{fill}' text-anchor='{anchor}' font-weight='{weight}' {font}>{s}</text>"


def poly(pts, stroke="#000", fill="none", width=1.0, dash=None, close=False, opacity=1.0):
    d = " ".join(f"{x:.1f},{y:.1f}" for x, y in pts)
    tag = "polygon" if close else "polyline"
    da = f" stroke-dasharray='{dash}'" if dash else ""
    return f"<{tag} points='{d}' stroke='{stroke}' fill='{fill}' stroke-width='{width}'{da} opacity='{opacity}' stroke-linejoin='round' stroke-linecap='round'/>"


def star(cx, cy, r, fill):
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy - rr * math.sin(a)))
    return poly(pts, stroke="#7A4B12", fill=fill, width=0.8, close=True)


# ---------------------------------------------------------------- 1. Top-down layout
def top_down():
    S, M = 1.1, 40
    X0, Z0 = 1640, -1900
    P = lambda x, z: (M + (x - X0) * S, M + 30 + (z - Z0) * S)
    out = []
    W, H = 1460, 1010
    out.append(text(M, 28, "Thousand-Bough Isle: top-down layout (world metres, north up)", 18, weight="bold", font=FONT))
    # sea
    sx, sy = P(1640, -1900)
    ex, ey = P(2460, -1100)
    out.append(f"<rect x='{sx}' y='{sy}' width='{ex-sx}' height='{ey-sy}' fill='#BFE3E0' stroke='#7FB5B0'/>")
    # island ellipse with coast noise
    pts = []
    for i in range(180):
        a = i / 180 * 2 * math.pi
        rr = 1 + 0.035 * math.sin(5 * a + 1) + 0.025 * math.sin(11 * a)
        pts.append(P(2050 + 300 * rr * math.cos(a), -1500 + 270 * rr * math.sin(a)))
    out.append(poly(pts, stroke="#8C7B55", fill="#CFE0A8", width=1.5, close=True))
    # valley floor (lighter) and cove
    out.append(poly([P(*p) for p in [(1830, -1300), (1800, -1560), (1880, -1650), (2010, -1700), (2150, -1660), (2260, -1560), (2250, -1400), (2200, -1290), (1990, -1285)]], stroke="none", fill="#A9CF84", close=True))
    cx, cy = P(1905, -1360)
    out.append(f"<ellipse cx='{cx}' cy='{cy}' rx='{75*S}' ry='{90*S}' fill='#8FD3C8' stroke='#5FA79C'/>")
    out.append(poly([P(1858, -1290), P(1952, -1290), P(1975, -1200), P(1840, -1200)], stroke="none", fill="#8FD3C8", close=True))
    out.append(text(*P(1880, -1330), "The cove (calm zone)", 11, "#1F5E57"))
    # approach lane
    lane = [(1860, -1120), (1905, -1265), (1931, -1372)]
    out.append(poly([P(*p) for p in lane], stroke="#1F5E9C", width=1.4, dash="6 4"))
    out.append(text(*P(1862, -1135), "approach lane from Meridian (±30 m clear)", 10, "#1F5E9C"))
    # ridge
    ridge = [(1840, -1300), (1790, -1420), (1800, -1560), (1835, -1705), (2010, -1748), (2200, -1695), (2290, -1560), (2280, -1400), (2240, -1285)]
    out.append(poly([P(*p) for p in ridge], stroke="#6B5A45", width=9, opacity=0.55))
    out.append(poly([P(*p) for p in ridge], stroke="#3A3F3C", width=1.2, dash="2 3"))
    for (x, z, n, h) in [(1835, -1705, "W Peak", 95), (2010, -1748, "Saddle", 58), (2200, -1695, "Thunder Crown", 125), (2240, -1285, "East Head", 28), (1840, -1300, "West Point", 18)]:
        px, py = P(x, z)
        out.append(poly([(px - 7, py + 6), (px, py - 7), (px + 7, py + 6)], stroke="#3A3F3C", fill="#8C8573", close=True))
        out.append(text(px + 9, py - 4, f"{n} {h} m", 10, "#3A3F3C"))
    # streams and pools
    streams = [
        [(1978, -1572), (1958, -1540), (1948, -1515), (1924, -1500), (1916, -1484), (1895, -1460), (1872, -1420)],
        [(1880, -1610), (1885, -1530), (1898, -1468)],
        [(2135, -1612), (2160, -1560), (2170, -1500), (2150, -1300)],
        [(2010, -1665), (2008, -1632)],
    ]
    for s_ in streams:
        out.append(poly([P(*p) for p in s_], stroke="#3B9AC4", width=2.4))
    for (x, z, r, n) in [(2010, -1665, 16, "Upper Pool"), (2135, -1612, 22, "Mirror Pool"), (1880, -1610, 12, "Silver Pool"), (1916, -1484, 4.5, ""), (1920, -1494, 4.5, ""), (1924, -1504, 4.5, "")]:
        px, py = P(x, z)
        out.append(f"<circle cx='{px}' cy='{py}' r='{r*S}' fill='#7CC8D8' stroke='#3B9AC4'/>")
        if n:
            out.append(text(px + r * S + 3, py + 4, n, 10, "#1F5E7C"))
    for (x, z, w, n) in [(2010, -1712, 14, "The Veil (28 m)"), (2150, -1652, 22, "Great Falls (55 m)"), (1878, -1650, 3, "Silver Thread (48 m)")]:
        px, py = P(x, z)
        out.append(f"<rect x='{px - w*S/2}' y='{py - 3}' width='{w*S}' height='6' fill='#FFFFFF' stroke='#3B9AC4'/>")
        if n.startswith("Great"):
            out.append(text(px + w * S / 2 + 4, py + 14, n, 10, "#1F5E7C"))
        else:
            out.append(text(px, py - 7, n, 10, "#1F5E7C", "middle"))
    out.append(text(*P(2170, -1627), "cave behind the falls (C2.2)", 9, "#5A3A1A"))
    # tree canopy and crown
    tx, ty = P(*T)
    out.append(f"<circle cx='{tx}' cy='{ty}' r='{60*S}' fill='#3E7A3A' fill-opacity='0.18' stroke='#1F4A2E' stroke-dasharray='5 4'/>")
    cxm, czm = bearing(50, 34)
    pxm, pym = P(cxm, czm)
    out.append(f"<ellipse cx='{pxm}' cy='{pym}' rx='{22*S}' ry='{16*S}' fill='#1F4A2E' fill-opacity='0.25' stroke='#1F4A2E' stroke-dasharray='2 2'/>")
    out.append(text(tx + 30 * S, ty + 66 * S, "canopy r 60 (open inside r 26; high crown NE to y 77)", 9, "#1F4A2E"))
    # Fern Walk
    walk = [(1945, -1432), (1948, -1458), (1934, -1488), (1950, -1510), (1957, -1518), (1980, -1532), (1992, -1538), (1996, -1544)]
    out.append(poly([P(*p) for p in walk], stroke="#C97A2B", width=3.2, dash="7 4"))
    out.append(text(*P(1960, -1470), "Fern Walk", 11, "#8A4D12", weight="bold"))
    # side paths
    out.append(poly([P(2032, -1566), P(2080, -1585), P(2116, -1600), P(2140, -1636)], stroke="#C97A2B", width=1.6, dash="3 3"))
    # jetty, boathouse, ship
    jx, jy = P(1936, -1425)
    out.append(f"<rect x='{jx}' y='{jy}' width='{6*S}' height='{75*S}' fill='#B07A45' stroke='#5A3A1A'/>")
    bx, by = P(1940, -1441)
    out.append(f"<rect x='{bx}' y='{by}' width='{18*S}' height='{14*S}' fill='#B07A45' stroke='#5A3A1A'/>")
    sx_, sy_ = P(1927.35, -1389)
    out.append(f"<rect x='{sx_}' y='{sy_}' width='{8*S}' height='{34*S}' rx='4' fill='#5A3A1A' stroke='#2B1A0A'/>")
    out.append(text(sx_ - 4, sy_ + 20, "ship", 10, "#2B1A0A", "end"))
    out.append(text(*P(1944, -1352), "Root Wharf (berth 1931.35, −1372)", 10, "#5A3A1A"))
    lx, ly = P(1956, -1442)
    out.append(f"<circle cx='{lx}' cy='{ly}' r='{7*S}' fill='#5E8C3A' stroke='#1F4A2E'/>")
    out.append(text(lx + 9, ly + 3, "little sister tree", 9, "#1F4A2E"))
    # view corridor
    out.append(poly([P(1939.2, -1376), P(*T)], stroke="#E2552D", width=1, dash="1 4"))
    # flume grid + gallery + boardwalk
    gx, gy = P(2000, -1628.4)
    out.append(f"<rect x='{gx}' y='{gy}' width='{16*S}' height='{12.8*S}' fill='#D8C29A' stroke='#5A3A1A'/>")
    out.append(text(gx - 4, gy - 4, "Flume Terrace (P2.1)", 10, "#5A3A1A", "end"))
    gax, gay = P(2020, -1623)
    out.append(f"<rect x='{gax}' y='{gay}' width='{8*S}' height='{10*S}' fill='#B07A45' stroke='#5A3A1A'/>")
    out.append(poly([P(2037, -1567), P(2040, -1595), P(2026, -1618)], stroke="#7D5A3A", width=2.4))
    # spire, bridges, gondola
    spx, spy = P(2066, -1594)
    out.append(f"<circle cx='{spx}' cy='{spy}' r='{7*S}' fill='#3A3F3C'/>")
    out.append(text(spx + 10, spy, "Spire: 5173 top / 5174 ledge", 10, "#3A3F3C"))
    out.append(poly([P(2045, -1563), P(2064, -1597)], stroke="#C8B48A", width=2.2))
    out.append(poly([P(2045, -1556), P(2066, -1587)], stroke="#C8B48A", width=2.2, dash="4 2"))
    out.append(poly([P(2043, -1552), P(2165, -1668)], stroke="#7A6FA0", width=1.2, dash="8 3"))
    clx, cly = P(2165, -1668)
    out.append(f"<rect x='{clx-6}' y='{cly-5}' width='12' height='10' fill='#E9E4F5' stroke='#7A6FA0'/>")
    out.append(text(clx + 8, cly - 6, "Cloud Loft (y 92)", 10, "#5A4F80"))
    # sun
    sun0 = P(1700, -1180)
    a = math.radians(290)
    sun1 = (sun0[0] + 60 * math.sin(a), sun0[1] - 60 * math.cos(a))
    out.append(f"<circle cx='{sun1[0]}' cy='{sun1[1]}' r='9' fill='#F2C14E' stroke='#C9902B'/>")
    out.append(poly([sun1, sun0], stroke="#C9902B", width=1.5))
    out.append(text(sun0[0] + 6, sun0[1] + 4, "sun from bearing ≈ 290°, elev 0.10 rad", 10, "#8A5A12"))
    # collectibles
    for (x, z) in [(1947, -1428), (1918, -1499), (1992.7, -1570), (1986.7, -1536.7), (2010, -1567)]:
        out.append(star(*P(x, z), 5, "#F28C38"))
    for (x, z, n) in [(1924, -1500, "C2.1"), (2150, -1646, "C2.2")]:
        px, py = P(x, z)
        out.append(f"<rect x='{px-4}' y='{py-4}' width='8' height='8' fill='#8A5A12' stroke='#2B1A0A'/>")
    for (x, z, n) in [(1858, -1335, "B2.1"), (1902, -1468, "B2.2"), (2122, -1592, "B2.3")]:
        px, py = P(x, z)
        out.append(f"<ellipse cx='{px}' cy='{py}' rx='3' ry='6' fill='#9FD6C9' stroke='#2E7C6E'/>")
        out.append(text(px + 5, py + 3, n, 9, "#2E7C6E"))
    # NPC stops (ground and tree-level, numbered)
    stops = [(1, 1949.5, -1436), (2, 1928, -1494), (3, 2010, -1547), (4, 2040, -1556), (5, 2024, -1618), (6, 1991.6, -1541.6), (7, 2020.9, -1529.9), (8, 2029.9, -1543.3), (9, 2010, -1552)]
    for n, x, z in stops:
        px, py = P(x, z)
        out.append(f"<circle cx='{px}' cy='{py}' r='7' fill='#C2307A' stroke='#FFFFFF' stroke-width='1.5'/>")
        out.append(text(px, py + 3.5, str(n), 9, "#FFFFFF", "middle", "bold"))
    # hero shot cameras on map
    for (n, x, z, tx_, tz_) in [("H1", 1700, -1020, 2010, -1560), ("H2", 1939.2, -1376, 2010, -1560), ("H3", 1980, -1532, 2010, -1556), ("H6", 2026, -1626, 2056, -1578), ("H10", 2150, -1640, 2120, -1595)]:
        if z > -1100:
            continue
        px, py = P(x, z)
        qx, qy = P(tx_, tz_)
        L = math.hypot(qx - px, qy - py)
        ux, uy = (qx - px) / L, (qy - py) / L
        out.append(poly([(px, py), (px + ux * 18, py + uy * 18)], stroke="#2B2A26", width=1.4))
        out.append(f"<circle cx='{px}' cy='{py}' r='3' fill='#2B2A26'/>")
        out.append(text(px - 5, py - 5, n, 9, "#2B2A26", "end", "bold"))
    # compass + scale
    cxp, cyp = P(2400, -1850)
    out.append(poly([(cxp, cyp - 22), (cxp + 7, cyp), (cxp, cyp - 5), (cxp - 7, cyp)], stroke="#2B2A26", fill="#2B2A26", close=True))
    out.append(text(cxp, cyp - 26, "N", 12, anchor="middle", weight="bold"))
    s0 = P(2250, -1130)
    out.append(poly([s0, (s0[0] + 100 * S, s0[1])], stroke="#2B2A26", width=2))
    out.append(text(s0[0], s0[1] - 5, "100 m", 10))
    # grid ticks
    for x in range(1700, 2460, 100):
        px, _ = P(x, -1900)
        out.append(text(px, M + 26, f"x {x}", 8, "#6B6656", "middle"))
    for z in range(-1800, -1100, 100):
        _, py = P(1640, z)
        out.append(text(M - 2, py + 3, f"z {z}", 8, "#6B6656", "end"))

    # ---- inset: the tree village (bearings, decks)
    IX, IY, IS = 960, 70, 3.0
    Q = lambda x, z: (IX + (x - 1940) * IS, IY + (z + 1650) * IS)
    out.append(f"<rect x='{IX}' y='{IY}' width='{150*IS}' height='{150*IS}' fill='#E6EED6' stroke='#8C7B55'/>")
    out.append(text(IX, IY - 8, "Inset: the tree village (x 1940–2090, z −1650 to −1500)", 13, weight="bold", font=FONT))
    qx, qy = Q(*T)
    out.append(f"<circle cx='{qx}' cy='{qy}' r='{24*IS}' fill='#D8C29A' stroke='#7D5A3A'/>")
    out.append(f"<circle cx='{qx}' cy='{qy}' r='{19.5*IS}' fill='none' stroke='#B07A45' stroke-width='{4*IS}' opacity='0.55'/>")
    out.append(f"<circle cx='{qx}' cy='{qy}' r='{9*IS}' fill='#8C8573' stroke='#4E4A40'/>")
    out.append(text(qx, qy + 3, "trunk", 10, "#FFFFFF", "middle"))
    # stair start/top markers
    for b, label in [(200, "stair foot y 18.5"), (80, "stair top y 50.5")]:
        px, pz = bearing(b, 17.5)
        sx2, sy2 = Q(px, pz)
        out.append(f"<circle cx='{sx2}' cy='{sy2}' r='4' fill='#5A3A1A'/>")
        out.append(text(sx2 + 6, sy2 + 3, label, 9, "#5A3A1A"))
    decks = [
        ("L1E Three Landings y 26.8", 90, 27, 16, 14, "#B07A45"),
        ("L2SW Signal y 31.3", 225, 26, 16, 12, "#B07A45"),
        ("L2S Practice Bough y 32.5", 160, 32, 12, 10, "#B07A45"),
        ("L3SE Chronicle y 40.2", 130, 26, 14, 12, "#B07A45"),
    ]
    for (n, b, r, dr, dt, col) in decks:
        c = bearing(b, r)
        a = math.radians(b)
        ur = (math.sin(a), -math.cos(a))
        ut = (math.cos(a), math.sin(a))
        corners = []
        for sr, st in [(-1, -1), (1, -1), (1, 1), (-1, 1)]:
            corners.append(Q(c[0] + ur[0] * dr / 2 * sr + ut[0] * dt / 2 * st, c[1] + ur[1] * dr / 2 * sr + ut[1] * dt / 2 * st))
        out.append(poly(corners, stroke="#5A3A1A", fill=col, close=True, opacity=0.85))
        lx2, ly2 = Q(*bearing(b, r + dr / 2 + 4))
        out.append(text(lx2, ly2, n, 9, "#2B1A0A", "middle"))
    cx2, cy2 = Q(2010, -1556)
    out.append(f"<circle cx='{cx2}' cy='{cy2}' r='{15*IS}' fill='none' stroke='#C9902B' stroke-width='2' stroke-dasharray='4 3'/>")
    out.append(text(cx2, cy2 - 15 * IS - 4, "L4 Crown Deck y 50.5 (r 15, above)", 9, "#8A5A12", "middle"))
    for (n, b, r, col) in [("Feature y 31", 315, 31, CREW["F"]), ("Bug Fix y 33", 0, 33, CREW["G"]), ("Docs y 31", 30, 32, CREW["T"])]:
        hx, hz = Q(*bearing(b, r))
        out.append(f"<rect x='{hx-9}' y='{hz-9}' width='18' height='18' fill='{col}' stroke='#1A1A1A'/>")
        out.append(text(hx, hz - 12, n, 9, col, "middle", "bold"))
    for b in (330, 0, 30):
        wx, wz = Q(*bearing(b, 26))
        out.append(f"<circle cx='{wx}' cy='{wz}' r='5' fill='none' stroke='#5A3A1A' stroke-width='2'/>")
    # grid in inset
    gx2, gy2 = Q(2000, -1628.4)
    out.append(f"<rect x='{gx2}' y='{gy2}' width='{16*IS}' height='{12.8*IS}' fill='#D8C29A' stroke='#5A3A1A'/>")
    for i in range(1, 5):
        out.append(poly([(gx2 + i * 3.2 * IS, gy2), (gx2 + i * 3.2 * IS, gy2 + 12.8 * IS)], stroke="#7D5A3A", width=0.6))
    for j in range(1, 4):
        out.append(poly([(gx2, gy2 + j * 3.2 * IS), (gx2 + 16 * IS, gy2 + j * 3.2 * IS)], stroke="#7D5A3A", width=0.6))
    out.append(text(gx2 + 8 * IS, gy2 - 4, "grid 5 × 4 (3.2 m tiles)", 9, "#5A3A1A", "middle"))
    for c, col in [(0, CREW["F"]), (2, CREW["G"]), (4, CREW["T"])]:
        x0 = 2001.6 + c * 3.2
        wb = {0: 330, 2: 0, 4: 30}[c]
        out.append(poly([Q(x0, -1615.6), Q(*bearing(wb, 26))], stroke=col, width=1.6))
    gax2, gay2 = Q(2020, -1623)
    out.append(f"<rect x='{gax2}' y='{gay2}' width='{8*IS}' height='{10*IS}' fill='#B07A45' stroke='#5A3A1A'/>")
    out.append(text(gax2 + 26, gay2 + 18, "Flume Gallery y 26", 9, "#5A3A1A"))
    out.append(poly([Q(2037, -1567), Q(2040, -1595), Q(2026, -1618)], stroke="#7D5A3A", width=3))
    out.append(poly([Q(1987, -1537), Q(2015, -1527)], stroke="#C8B48A", width=3))
    out.append(text(*Q(1996, -1524), "R1", 10, "#7D5A3A", weight="bold"))
    out.append(poly([Q(2045, -1563), Q(2064, -1597)], stroke="#C8B48A", width=3))
    out.append(poly([Q(2045, -1556), Q(2066, -1587)], stroke="#C8B48A", width=3, dash="5 3"))
    out.append(text(*Q(2056, -1600), "R2 → 5173", 9, "#7D5A3A", weight="bold"))
    out.append(text(*Q(2062, -1580), "R3 → 5174", 9, "#7D5A3A", weight="bold"))
    spx2, spy2 = Q(2066, -1594)
    out.append(f"<circle cx='{spx2}' cy='{spy2}' r='{7*IS}' fill='#3A3F3C' opacity='0.85'/>")
    out.append(poly([Q(2043, -1552), Q(2090, -1596)], stroke="#7A6FA0", width=1.4, dash="8 3"))
    out.append(text(*Q(2072, -1556), "gondola to Cloud Loft", 9, "#5A4F80"))
    kx, ky = Q(*bearing(270, 23))
    out.append(f"<rect x='{kx-5}' y='{ky-5}' width='10' height='10' fill='#C9A86A' stroke='#5A3A1A'/>")
    out.append(text(kx - 8, ky + 3, "Sky Basket", 9, "#5A3A1A", "end"))
    out.append(poly([Q(1980, -1532), Q(1992, -1538), Q(1996, -1544)], stroke="#C97A2B", width=3, dash="6 3"))
    out.append(text(*Q(1960, -1528), "Root Gate", 9, "#8A4D12"))
    out.append(text(IX + 6, IY + 150 * IS - 8, "3 (Saffi, y 18.5) and 9 (Elder, y 50.5) stand one above the other.", 9, "#5A3A1A"))
    for n, x, z in stops[2:]:
        px, py = Q(x, z)
        if n == 9:
            px, py = px + 10, py - 10
        out.append(f"<circle cx='{px}' cy='{py}' r='8' fill='#C2307A' stroke='#FFFFFF' stroke-width='1.5'/>")
        out.append(text(px, py + 3.5, str(n), 10, "#FFFFFF", "middle", "bold"))
    # legend
    LX, LY = 960, 560
    legend = [
        ("#C2307A", "NPC stop (1 Tamsin, 2 Lyra, 3 Saffi, 4 Oak, 5 Fen, 6 Ines, 7 Rook, 8 Pip, 9 Elder)"),
        ("#F28C38", "starfish (5)"),
        ("#8A5A12", "chest C2.1 Booth Pools, C2.2 behind Great Falls"),
        ("#9FD6C9", "message bottles B2.1–B2.3"),
        ("#C97A2B", "Fern Walk and side paths"),
        ("#C8B48A", "rope bridges (R3 dashed: opens in the twist)"),
        ("#3B9AC4", "streams, pools, waterfalls"),
        ("#E2552D", "berth → tree view corridor (kept clear)"),
        ("#2B2A26", "hero-shot cameras (H1 off map to the SW; H9 is from Meridian)"),
    ]
    out.append(text(LX, LY - 10, "Legend", 13, weight="bold", font=FONT))
    for i, (col, s_) in enumerate(legend):
        out.append(f"<rect x='{LX}' y='{LY + i*20}' width='14' height='12' fill='{col}'/>")
        out.append(text(LX + 20, LY + i * 20 + 10, s_, 11))
    notes = [
        "Helix stair: clockwise, r 15.5–19.5, 12 m rise per turn, from bearing 200 (y 18.5) to bearing 80 (y 50.5).",
        "Decks branch outward from the helix; nothing crosses the stair band within 4.5 m above it.",
        "Crew houses aren't walkable; their basket lifts rise from the three wheels when water reaches them.",
        "Island bounds x 1640–2460, z −1900 to −1100; centre (2050, −1500); tree T = (2010, −1560).",
    ]
    for i, s_ in enumerate(notes):
        out.append(text(LX, LY + 200 + i * 18, s_, 10.5, "#3A3A3A"))
    return svg(W, H, "\n".join(out), "Thousand-Bough Isle top-down layout")


# ---------------------------------------------------------------- 2. Elevation of the tree village
def elevation():
    S, M = 3.0, 50
    X0, X1 = 1860, 2210
    W = int((X1 - X0) * S + 2 * M + 260)
    H = int(135 * S + 2 * M + 40)
    E = lambda x, y: (M + (x - X0) * S, M + 20 + (130 - y) * S)
    out = [text(M, 32, "Tree village elevation: looking north through T (x across, y up; 1 px = 1/3 m)", 17, weight="bold", font=FONT)]
    # sky and background ridge
    out.append(f"<rect x='{M}' y='{M+20}' width='{(X1-X0)*S}' height='{130*S}' fill='#F3E6C9'/>")
    ridge = [(X0, 70), (1835, 95), (1900, 82), (1960, 66), (2010, 58), (2060, 70), (2120, 98), (2200, 125), (X1, 118), (X1, 0), (X0, 0)]
    out.append(poly([E(*p) for p in ridge], stroke="none", fill="#8FA58A", close=True, opacity=0.55))
    out.append(text(*E(1950, 64), "saddle 58", 10, "#3A4A38", "middle"))
    out.append(text(*E(2190, 127), "Thunder Crown 125", 10, "#3A4A38", "end"))
    for (x, y0, y1, w, n) in [(2010, 52, 23.5, 14, "the Veil (behind)"), (2150, 70, 15, 22, "Great Falls"), (1878, 60, 12, 3, "Silver Thread")]:
        a, b = E(x - w / 2, y0)
        c, d = E(x + w / 2, y1)
        out.append(f"<rect x='{a}' y='{b}' width='{c-a}' height='{d-b}' fill='#FFFFFF' opacity='0.75' stroke='#9CC9DA'/>")
        out.append(text((a + c) / 2, b - 4, n, 9, "#1F5E7C", "middle"))
    # cloud loft + gondola
    out.append(poly([E(2043, 28), E(2165, 92)], stroke="#7A6FA0", width=1.4, dash="8 3"))
    lx, ly = E(2165, 92)
    out.append(f"<rect x='{lx-10}' y='{ly-8}' width='20' height='16' fill='#E9E4F5' stroke='#7A6FA0'/>")
    out.append(text(lx - 14, ly + 4, "Cloud Loft y 92", 10, "#5A4F80", "end"))
    # foreground terrain along z ≈ −1560
    terr = [(X0, 9), (1900, 10.5), (1950, 13), (1976, 18.5), (2044, 18.5), (2058, 14), (2075, 13.5), (2110, 16), (2160, 22), (2200, 34), (X1, 40), (X1, -2), (X0, -2)]
    out.append(poly([E(*p) for p in terr], stroke="#6B5A45", fill="#A9CF84", close=True))
    # mist band
    a, b = E(X0, 34)
    c, d = E(X1, 8)
    out.append(f"<rect x='{a}' y='{b}' width='{c-a}' height='{d-b}' fill='#9FB3C8' opacity='0.28'/>")
    out.append(text(a + 6, b + 14, "valley mist y 8–34 (mood.mistTop)", 11, "#40556B"))
    # canopy pads (projected)
    pads = [(175, 42, 44, 22, 8), (260, 42, 42, 20, 7), (320, 40, 47, 18, 8), (110, 42, 47, 20, 8), (20, 40, 52, 20, 9), (215, 52, 40, 14, 6), (140, 54, 44, 14, 6)]
    for b_, r, y, rx, ry in pads:
        x, _ = bearing(b_, r)
        px, py = E(x, y)
        out.append(f"<ellipse cx='{px}' cy='{py}' rx='{rx*S}' ry='{ry*S}' fill='#3E7A3A' opacity='0.35'/>")
    cx_, _ = bearing(50, 34)
    px, py = E(cx_, 67.5)
    out.append(f"<ellipse cx='{px}' cy='{py}' rx='{20*S}' ry='{9.5*S}' fill='#1F4A2E' opacity='0.55'/>")
    out.append(text(px + 22 * S, py - 6, "high crown, top y 77 (NE)", 10, "#1F4A2E"))
    # trunk
    prof = [(18.5, 9), (30, 8), (40, 7), (50, 6), (52, 5.5)]
    left = [E(T[0] - r, y) for y, r in prof]
    right = [E(T[0] + r, y) for y, r in reversed(prof)]
    out.append(poly([E(T[0] - 14, 17)] + left + right + [E(T[0] + 14, 17)], stroke="#4E4A40", fill="#8C8573", close=True))
    # helix (front solid, back dashed)
    pts_front, pts_back = [], []
    segs = []
    for i in range(0, 961, 4):
        b_ = (200 + i) % 360
        x, z = bearing(b_, 17.5)
        y = helix_y(i)
        front = math.cos(math.radians(b_)) < 0  # south side faces the viewer
        segs.append((E(x, y), front))
    for (p0, f0), (p1, f1) in zip(segs, segs[1:]):
        out.append(poly([p0, p1], stroke="#5A3A1A", width=2.2 if f0 else 1.0, dash=None if f0 else "3 3", opacity=1 if f0 else 0.6))
    # decks
    decks = [("L0 Root Hall 18.5", 1986, 2034, 18.5), ("L1E Three Landings 26.8", 2029, 2045, 26.8), ("L2SW Signal 31.3", 1980, 1999, 31.3), ("L2S Practice Bough 32.5", 2015, 2027, 32.5), ("L3SE Chronicle 40.2", 2023, 2037, 40.2), ("L4 Crown Deck 50.5", 1995, 2025, 50.5)]
    for n, xa, xb, y in decks:
        a, b = E(xa, y)
        c, _ = E(xb, y)
        out.append(f"<rect x='{a}' y='{b-3}' width='{c-a}' height='6' fill='#B07A45' stroke='#5A3A1A'/>")
    labels = [("L0 Root Hall · Saffi · y 18.5", 1880, 20), ("L1E Three Landings · Oak · y 26.8", 2060, 30), ("L2SW Signal Deck · Ines · y 31.3", 1880, 33), ("L2S Practice Bough · Rook · y 32.5", 2060, 37.5), ("L3SE Chronicle Loft · Pip · y 40.2", 2060, 44), ("L4 Crown Deck · Elder · y 50.5", 1880, 53)]
    deck_x = {"L0": 1986, "L1E": 2045, "L2SW": 1980, "L2S": 2027, "L3SE": 2037, "L4": 1995}
    deck_y = {"L0": 18.5, "L1E": 26.8, "L2SW": 31.3, "L2S": 32.5, "L3SE": 40.2, "L4": 50.5}
    for s_, x, y in labels:
        out.append(text(*E(x, y), s_, 10.5, "#2B1A0A"))
        key = s_.split()[0]
        lx_ = x + (52 if x < 1950 else -2)
        out.append(poly([E(lx_, y - 0.6), E(deck_x[key], deck_y[key])], stroke="#7D5A3A", width=0.7, dash="2 2"))
    # houses
    for (b_, r, y, col, n) in [(315, 31, 31, CREW["F"], "Feature"), (0, 33, 33, CREW["G"], "Bug Fix"), (30, 32, 31, CREW["T"], "Docs")]:
        x, _ = bearing(b_, r)
        a, b = E(x - 3.5, y + 6)
        out.append(f"<rect x='{a}' y='{b}' width='{7*S}' height='{6*S}' fill='{col}' opacity='0.8' stroke='#1A1A1A'/>")
        out.append(poly([E(x - 4.5, y + 6), E(x, y + 9.5), E(x + 4.5, y + 6)], stroke="#5A3A1A", fill="#C9A86A", close=True))
    out.append(text(*E(1975, 43.5), "crew houses (behind, north): Feature · Bug Fix · Docs", 9.5, "#1A1A1A"))
    # beacon
    bx, by = E(2010, 50.5)
    tx2, ty2 = E(2010, 64)
    out.append(poly([(bx, by), (tx2, ty2)], stroke="#5A3A1A", width=2))
    out.append(f"<circle cx='{tx2}' cy='{ty2}' r='7' fill='#FFF1C8' stroke='#C9902B' stroke-width='2'/>")
    out.append(text(tx2 + 10, ty2 + 4, "Crown Beacon y 64", 10, "#8A5A12"))
    # sky basket
    kx, _ = bearing(270, 23)
    out.append(poly([E(kx, 18.5), E(kx, 50.5)], stroke="#7D5A3A", width=1, dash="2 2"))
    out.append(text(*E(kx - 1, 46), "Sky Basket", 9, "#5A3A1A", "end"))
    # spire and bridges
    out.append(poly([E(2059, 13), E(2061, 27), E(2071, 27), E(2073, 13)], stroke="#2B2F2C", fill="#3A3F3C", close=True))
    out.append(text(*E(2075, 22), "Spire 5173 (27) / 5174 (24.5)", 10, "#2B2F2C"))

    def sag(x0, y0, x1, y1, s_):
        pts = []
        for i in range(21):
            t = i / 20
            pts.append(E(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - s_ * 4 * t * (1 - t)))
        return pts

    out.append(poly(sag(2045, 26.8, 2064, 27, 1.8), stroke="#C8B48A", width=2.2))
    out.append(poly(sag(2045, 26.8, 2066, 24.5, 1.5), stroke="#C8B48A", width=2.2, dash="4 2"))
    out.append(poly(sag(1987, 31.3, 2015, 32.5, 1.2), stroke="#C8B48A", width=2.2))
    out.append(text(*E(1996, 29.2), "R1", 10, "#7D5A3A", weight="bold"))
    # y scale
    for y in range(0, 131, 10):
        a, b = E(X0, y)
        out.append(poly([(a - 6, b), (a, b)], stroke="#6B6656"))
        out.append(text(a - 8, b + 3, f"{y}", 9, "#6B6656", "end"))
    out.append(text(M - 40, M + 14, "y (m)", 10, "#6B6656"))
    # side table
    TX = M + (X1 - X0) * S + 20
    rows = [
        "Levels (helix y = 18.5 + 12·θ/360)",
        "L0 Root Hall 18.5 (θ 0, bearing 200)",
        "L1E Three Landings 26.8 (θ 250)",
        "L2SW Signal Deck 31.3 (θ 385)",
        "L2S Practice Bough 32.5 (bridge R1)",
        "L3SE Chronicle Loft 40.2 (θ 650)",
        "L4 Crown Deck 50.5 (θ 960)",
        "Canopy pads bottoms ≥ 36,",
        "  tops ≤ 48 S side, ≤ 56 elsewhere",
        "High crown NE y 58–77",
        "Clearance: 4.5 m over every walk,",
        "  6 m leaves above, 4 m beside",
        "Sun ≈ 6° from WNW: the deck faces",
        "  west light; the crown sits",
        "  above the mist in gold",
    ]
    for i, s_ in enumerate(rows):
        out.append(text(TX, M + 40 + i * 18, s_, 11 if i else 12, "#2B2A26", weight="bold" if i == 0 else "normal"))
    return svg(W, H, "\n".join(out), "Thousand-Bough tree village elevation")


# ---------------------------------------------------------------- 3. Channel Routing grids
def tile_svg(x, y, s, kind, rot, color=None):
    o = [f"<rect x='{x}' y='{y}' width='{s}' height='{s}' fill='#E8D7B0' stroke='#7D5A3A'/>"]
    cx, cy = x + s / 2, y + s / 2
    if kind == "R":
        o.append(f"<circle cx='{cx}' cy='{cy}' r='{s*0.36}' fill='#6B6A64' stroke='#3A3F3C'/>")
        return o
    col = color or "#B7A27A"
    w = s * 0.28
    mid = {0: (cx, y), 1: (x + s, cy), 2: (cx, y + s), 3: (x, cy)}
    if kind == "S":
        a, b = (mid[0], mid[2]) if rot == 0 else (mid[1], mid[3])
        o.append(poly([a, b], stroke=col, width=w))
    else:
        sides = [(0, 1), (1, 2), (2, 3), (3, 0)][rot]
        o.append(poly([mid[sides[0]], (cx, cy), mid[sides[1]]], stroke=col, width=w))
    return o


def board_svg(ox, oy, grid, rots, title, colored=None, gates=("F", "G", "T")):
    s = 52
    o = [text(ox, oy - 34, title, 13, weight="bold", font=FONT)]
    for i, (c, k) in enumerate(zip((1, 2, 3), ("F", "G", "T"))):
        gx = ox + c * s + s / 2
        live = k in gates
        o.append(f"<rect x='{gx-14}' y='{oy-24}' width='28' height='18' fill='{CREW[k] if live else '#CCCCCC'}' stroke='#1A1A1A'/>")
        o.append(text(gx, oy - 11, {"F": "Feat", "G": "Bug", "T": "Docs"}[k], 9, "#FFFFFF", "middle", "bold"))
    for r in range(4):
        for c in range(5):
            col = colored.get((r, c)) if colored else None
            o += tile_svg(ox + c * s, oy + r * s, s, grid[r][c], rots[r][c], col)
            o.append(text(ox + c * s + 3, oy + r * s + 10, f"{r}{c}", 7.5, "#7D5A3A"))
    for c, k in [(0, "F"), (2, "G"), (4, "T")]:
        wx = ox + c * s + s / 2
        o.append(f"<circle cx='{wx}' cy='{oy + 4*s + 14}' r='11' fill='none' stroke='{CREW[k]}' stroke-width='3'/>")
        o.append(text(wx, oy + 4 * s + 38, {"F": "Feature wheel", "G": "Bug Fix wheel", "T": "Docs wheel"}[k], 9, CREW[k], "middle", "bold"))
    for c in (1, 3):
        o.append(text(ox + c * s + s / 2, oy + 4 * s + 18, "main", 9, "#8A4D12", "middle"))
    o.append(text(ox - 6, oy + 2 * s, "main", 9, "#8A4D12", "end"))
    o.append(text(ox + 5 * s + 6, oy + 2 * s, "main", 9, "#8A4D12"))
    return o


def grids():
    sa = solutions(BOARD_A, PAIRS)
    sb = solutions(BOARD_B, PAIRS)
    assert len(sa) == 1 and len(sb) == 1, (len(sa), len(sb))

    def solved(board, sol):
        rots = [[0] * 5 for _ in range(4)]
        colored = {}
        for k, path in zip("FGT", sol):
            for cell, rot in rotations_for(path).items():
                rots[cell[0]][cell[1]] = rot
                colored[cell] = CREW[k]
        return rots, colored

    ra, ca = solved(BOARD_A, sa[0])
    rb, cb = solved(BOARD_B, sb[0])
    # unused elbows on board A keep their start rotation
    for (r, c) in [(2, 1), (2, 3)]:
        ra[r][c] = START_A[r][c]
    rb[1][3] = 0
    o = [text(30, 30, "Channel Routing (P2.1): boards, starts and the one solution of each", 18, weight="bold", font=FONT)]
    o += board_svg(60, 110, BOARD_A, START_A, "Board A, start (Rounds 1–2)")
    o += board_svg(400, 110, BOARD_A, ra, "Board A, Round 2 solution (unique)", ca)
    o += board_svg(740, 110, BOARD_B, [[0] * 5 for _ in range(4)], "Board B, start: all rot 0 (Round 3)")
    o += board_svg(1080, 110, BOARD_B, rb, "Board B, Round 3 solution (unique)", cb)
    notes = [
        "Rows run north (r0, the gates) to south (r3, the wheels). Gates: Feature c1, Bug Fix c2, Docs c3. Wheels: Feature c0, Bug Fix c2, Docs c4.",
        "Outlets c1 and c3 and both side edges spill into the Great Hall's sluice: 'main', your main checkout.",
        "Elbow rotation 0 = N–E, 1 = E–S, 2 = S–W, 3 = W–N (each press turns 90° clockwise). Straight 0 = N–S, 1 = E–W.",
        "Round 1: only Feature's gate is live. Round 2: all three, same board. Round 3: a boulder falls into r2c2 and Bug Fix must detour west.",
        f"Solver check (this script): Board A, three crews: {len(sa)} solution; Board B, three crews: {len(sb)} solution (unused tiles may point any way).",
    ]
    for i, s_ in enumerate(notes):
        o.append(text(60, 440 + i * 20, s_, 12))
    return svg(1400, 560, "\n".join(o), "Channel Routing boards"), len(sa), len(sb)


if __name__ == "__main__":
    with open(os.path.join(HERE, "top-down-layout.svg"), "w") as f:
        f.write(top_down())
    with open(os.path.join(HERE, "tree-elevation.svg"), "w") as f:
        f.write(elevation())
    g, na, nb = grids()
    with open(os.path.join(HERE, "channel-routing-grids.svg"), "w") as f:
        f.write(g)
    print(f"wrote 3 SVGs; Board A solutions: {na}, Board B solutions: {nb}")
