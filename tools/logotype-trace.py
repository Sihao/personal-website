"""Traces the cursive reference character (tools/ref/logotype-ref.png) into
the data tools/logotype.html paints from: the outlines of the ink (outer
edges and holes, for the mask) and the strokes as centre lines, each point
with the stroke's width there (for the brush's pressure).

Needs numpy, scipy, scikit-image and pillow. Run
    python tools/logotype-trace.py > tools/logotype-data.js
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import filters, measure, morphology

UPSCALE = 3          # trace at 3x the reference, smoothed, for clean curves
SMOOTH = 1.6         # px (upscaled) of Gaussian smoothing before the threshold
MIN_SPUR = 18        # px (upscaled); shorter skeleton branches are dropped
STEP = 5             # px (upscaled) between points of a stroke

src = Path(__file__).with_name("ref") / "logotype-ref.png"
grey = np.asarray(Image.open(src).convert("L"), dtype=float) / 255
# Ink is the darker of the two tones, split by Otsu's threshold, so a
# reference on dark paper works too.
ink = morphology.remove_small_objects(ndimage.binary_opening(grey < filters.threshold_otsu(grey), iterations=1), max_size=150)
rows, cols = np.nonzero(ink)
pad = 6
ink = ink[max(0, rows.min() - pad):rows.max() + pad + 1, max(0, cols.min() - pad):cols.max() + pad + 1]

big = ndimage.zoom(ink.astype(float), UPSCALE, order=1)
big = ndimage.gaussian_filter(big, SMOOTH) > 0.5
h, w = big.shape

outlines = []
for c in measure.find_contours(np.pad(big, 1).astype(float), 0.5):
    c = measure.approximate_polygon(c - 1, tolerance=0.8)
    if len(c) >= 4:
        outlines.append([[round(float(x), 1), round(float(y), 1)] for y, x in c])

# Centre lines: the skeleton, split into paths between ends and junctions.
skel = morphology.skeletonize(big)
dist = ndimage.distance_transform_edt(big)
pts = set(zip(*np.nonzero(skel)))
OFF = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
def nbrs(p):
    return [(p[0] + a, p[1] + b) for a, b in OFF if (p[0] + a, p[1] + b) in pts]
deg = {p: len(nbrs(p)) for p in pts}
nodes = {p for p in pts if deg[p] != 2}
used = set()
paths = []
def walk(a, b):
    path = [a, b]
    used.add(frozenset((a, b)))
    while path[-1] not in nodes:
        nxt = [q for q in nbrs(path[-1]) if frozenset((path[-1], q)) not in used and q != path[-2]]
        if not nxt:
            break
        used.add(frozenset((path[-1], nxt[0])))
        path.append(nxt[0])
    return path
for n in nodes:
    for q in nbrs(n):
        if frozenset((n, q)) not in used:
            paths.append(walk(n, q))
for p in pts:                       # closed loops with no node on them
    for q in nbrs(p):
        if frozenset((p, q)) not in used:
            paths.append(walk(p, q))

strokes = []
for path in paths:
    arr = np.array(path, dtype=float)
    ends_free = deg[path[0]] == 1 or deg[path[-1]] == 1
    length = np.sum(np.hypot(*np.diff(arr, axis=0).T))
    if length < MIN_SPUR and ends_free:
        continue
    if length < 12:                 # a step inside a junction
        continue
    if len(arr) > 5:                # smooth the pixel staircase
        k = np.ones(5) / 5
        arr[2:-2, 0] = np.convolve(arr[:, 0], k, "valid")
        arr[2:-2, 1] = np.convolve(arr[:, 1], k, "valid")
    keep = [0]
    acc = 0
    for i in range(1, len(arr)):
        acc += np.hypot(*(arr[i] - arr[i - 1]))
        if acc >= STEP:
            keep.append(i)
            acc = 0
    if keep[-1] != len(arr) - 1:
        keep.append(len(arr) - 1)
    strokes.append([[round(arr[i, 1], 1), round(arr[i, 0], 1),
                     round(2 * float(dist[path[i]]), 1)] for i in keep])

# Join pieces that meet at a junction and run on in the same direction
# into one stroke, as the brush wrote them: best-aligned pairs of ends
# first, while their ends are within JOIN px and they turn less than 70 deg.
JOIN = 30
def end(s, at_start):
    q = s[0] if at_start else s[-1]
    r = s[min(3, len(s) - 1)] if at_start else s[max(-4, -len(s))]
    d = np.array([q[0] - r[0], q[1] - r[1]])
    return np.array(q[:2]), d / (np.hypot(*d) or 1)
while True:
    best = None
    for i in range(len(strokes)):
        for j in range(i + 1, len(strokes)):
            for ai in (True, False):
                for aj in (True, False):
                    p, u = end(strokes[i], ai)
                    q, v = end(strokes[j], aj)
                    gap = np.hypot(*(p - q))
                    if gap > JOIN or len(strokes[i]) < 2 or len(strokes[j]) < 2:
                        continue
                    turn = float(np.dot(u, v))        # -1: runs straight on
                    if turn > -0.34:
                        continue
                    score = gap + 40 * (1 + turn)
                    if best is None or score < best[0]:
                        best = (score, i, j, ai, aj)
    if best is None:
        break
    _, i, j, ai, aj = best
    a_ = strokes[i][::-1] if ai else strokes[i]          # ends at the joint
    b_ = strokes[j] if aj else strokes[j][::-1]          # starts at the joint
    strokes[i] = a_ + b_
    del strokes[j]

data = {"w": w, "h": h, "outlines": outlines, "strokes": strokes}
sys.stdout.write("// Generated by tools/logotype-trace.py from tools/ref/logotype-ref.png.\n")
sys.stdout.write("var LOGOTYPE = " + json.dumps(data, separators=(",", ":")) + ";\n")
print(f"{w}x{h}, {len(outlines)} outlines, {len(strokes)} strokes", file=sys.stderr)
