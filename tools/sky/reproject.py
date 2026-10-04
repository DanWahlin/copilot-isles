"""Reprojects five cube faces (90 degree FOV) into the cloud layer's above-horizon equirect layout.

u = azimuth atan2(z, x) / 2pi, v = zenith angle / (pi/2 + 2 degrees), matching BakedPanorama.ts.
Each face comes as <name>-light-<i>.png (the clouds' light, sRGB) and <name>-alpha-<i>.png (their
transmittance, written by the canvas as sRGB grey), <frames> captures each, averaged. The output is
RGBA: rgb = light + transmittance * pedestal (sRGB), alpha = transmittance (linear). The faint cirrus
veil (under 8% cover) is left out of the transmittance (it still adds its light), and the cover is
smoothed and stored in 16 steps, so the lossless alpha stays small.
usage: python3 reproject.py <faces dir> <out.webp> <faces json> <pedestal json> <frames>
"""
import json
import sys

import numpy as np
from PIL import Image

W, H = 4096, 1024
V_SPAN = np.pi / 2 + np.radians(2)
VEIL = 0.08
LEVELS = 16


def srgb_to_linear(s: np.ndarray) -> np.ndarray:
    return np.where(s <= 0.04045, s / 12.92, ((s + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(v: np.ndarray) -> np.ndarray:
    v = np.clip(v, 0, 1)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)


def blur(x: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian; wraps in azimuth (u), clamps at the zenith and horizon rows."""
    r = int(np.ceil(sigma * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = sum(w * np.roll(x, i - r, axis=1) for i, w in enumerate(k))
    pad = np.pad(out, ((r, r), (0, 0)), mode="edge")
    return sum(w * pad[i : i + x.shape[0]] for i, w in enumerate(k))


def load(src: str, name: str, layer: str, frames: int, mode: str) -> np.ndarray:
    acc = None
    for i in range(frames):
        img = np.asarray(Image.open(f"{src}/{name}-{layer}-{i}.png").convert(mode), dtype=np.float32) / 255
        acc = img if acc is None else acc + img
    return acc / frames


def main() -> None:
    src, out, faces = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    pedestal = np.array(json.loads(sys.argv[4]), np.float32)
    frames = int(sys.argv[5])
    imgs = {}
    for f in faces:
        light = srgb_to_linear(load(src, f["name"], "light", frames, "RGB"))
        alpha = srgb_to_linear(load(src, f["name"], "alpha", frames, "L"))
        imgs[f["name"]] = np.concatenate([light, alpha[..., None]], axis=-1)

    az = (np.arange(W) + 0.5) / W * 2 * np.pi
    zen = (np.arange(H) + 0.5) / H * V_SPAN
    az, zen = np.meshgrid(az, zen)
    d = np.stack([np.sin(zen) * np.cos(az), np.cos(zen), np.sin(zen) * np.sin(az)], axis=-1)

    result = np.zeros((H, W, 4), np.float32)
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

    # Below the horizon the layer repeats the horizon row (the bake camera sees nothing there).
    horizon = int(np.floor((np.pi / 2) / V_SPAN * H)) - 1
    result[horizon + 1 :] = result[horizon]
    best[horizon + 1 :] = 1
    if (best < 0).any():
        raise SystemExit(f"{int((best < 0).sum())} panorama texels had no face")

    cover = np.maximum(1 - result[..., 3] - VEIL, 0) / (1 - VEIL)
    cover = np.round(np.clip(blur(cover, 1.0), 0, 1) * (LEVELS - 1)) / (LEVELS - 1)
    transmittance = 1 - cover
    rgb = linear_to_srgb(result[..., :3] + transmittance[..., None] * pedestal)
    rgba = np.clip(np.concatenate([rgb, transmittance[..., None]], axis=-1) * 255 + 0.5, 0, 255)
    # exact: keep the light under dense cloud (low alpha); the alpha itself is stored losslessly.
    Image.fromarray(rgba.astype(np.uint8)).save(out, quality=85, method=6, exact=True)
    print(f"wrote {out} ({W}x{H})")


main()
