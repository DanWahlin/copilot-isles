"""Reprojects five cube faces (90 degree FOV) into the sky dome's above-horizon equirect layout.

u = azimuth atan2(z, x) / 2pi, v = zenith angle / (pi/2 + 2 degrees), matching BakedPanorama.ts.
usage: python3 reproject.py <faces dir> <out.webp> <faces json>
"""
import json
import sys

import numpy as np
from PIL import Image

W, H = 4096, 1024
V_SPAN = np.pi / 2 + np.radians(2)


def main() -> None:
    src, out, faces = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    imgs = {
        f["name"]: np.asarray(Image.open(f"{src}/{f['name']}.png").convert("RGB"), dtype=np.float32)
        for f in faces
    }

    az = (np.arange(W) + 0.5) / W * 2 * np.pi
    zen = (np.arange(H) + 0.5) / H * V_SPAN
    az, zen = np.meshgrid(az, zen)
    d = np.stack([np.sin(zen) * np.cos(az), np.cos(zen), np.sin(zen) * np.sin(az)], axis=-1)

    result = np.zeros((H, W, 3), np.float32)
    best = np.full((H, W), -1.0, np.float32)
    for f in faces:
        fd = np.array(f["dir"], np.float32)
        up = np.array(f["up"], np.float32)
        right = np.cross(fd, up)
        right /= np.linalg.norm(right)
        true_up = np.cross(right, fd)
        z = d @ fd
        x = (d @ right) / np.maximum(z, 1e-6)
        y = (d @ true_up) / np.maximum(z, 1e-6)
        # Each texel comes from its most head-on face.
        inside = (z > best) & (z > 0) & (np.abs(x) <= 1) & (np.abs(y) <= 1)
        img = imgs[f["name"]]
        fh, fw = img.shape[:2]
        px = np.clip((x + 1) * 0.5 * fw - 0.5, 0, fw - 1.001)
        py = np.clip((1 - y) * 0.5 * fh - 0.5, 0, fh - 1.001)
        x0 = np.floor(px).astype(int)
        y0 = np.floor(py).astype(int)
        tx = (px - x0)[..., None]
        ty = (py - y0)[..., None]
        s = (
            img[y0, x0] * (1 - tx) * (1 - ty)
            + img[y0, x0 + 1] * tx * (1 - ty)
            + img[y0 + 1, x0] * (1 - tx) * ty
            + img[y0 + 1, x0 + 1] * tx * ty
        )
        result[inside] = s[inside]
        best = np.where(inside, z, best)

    # Below the horizon the dome repeats the horizon row (the bake camera sees nothing there).
    horizon = int(np.floor((np.pi / 2) / V_SPAN * H)) - 1
    result[horizon + 1 :] = result[horizon]
    best[horizon + 1 :] = 1
    if (best < 0).any():
        raise SystemExit(f"{int((best < 0).sum())} panorama texels had no face")
    Image.fromarray(np.clip(result + 0.5, 0, 255).astype(np.uint8)).save(out, quality=88, method=6)
    print(f"wrote {out} ({W}x{H})")


main()
