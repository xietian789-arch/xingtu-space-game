"""Extract the metallic title from its smooth navy backdrop into RGBA PNG."""

from pathlib import Path

import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT_ROOT / "textures/home-layers/title-interstellar-exploration.png"
OUTPUT = PROJECT_ROOT / "textures/home-layers/title-interstellar-exploration-transparent.png"


def smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    value = np.clip((value - edge0) / (edge1 - edge0), 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def main() -> None:
    source = np.asarray(Image.open(SOURCE).convert("RGB"), dtype=np.float32)
    height, width, _ = source.shape

    yy, xx = np.mgrid[0:height, 0:width]
    x = xx.astype(np.float32) / max(width - 1, 1)
    y = yy.astype(np.float32) / max(height - 1, 1)

    # The source backdrop is a smooth dark-blue gradient. Fit a quadratic surface
    # from genuinely dark samples so the metallic title itself cannot influence it.
    brightness = source.max(axis=2)
    background_samples = brightness < 34.0
    sample = background_samples & ((xx % 4) == 0) & ((yy % 4) == 0)
    design = np.stack(
        [
            np.ones_like(x),
            x,
            y,
            x * x,
            x * y,
            y * y,
        ],
        axis=-1,
    )
    coefficients = np.linalg.lstsq(design[sample], source[sample], rcond=None)[0]
    backdrop = np.clip(design @ coefficients, 0.0, 255.0)

    positive_delta = np.maximum(source - backdrop, 0.0)
    peak_delta = positive_delta.max(axis=2)
    energy = np.sqrt(np.sum(positive_delta * positive_delta, axis=2))
    signal = np.maximum(peak_delta, energy * 0.68)

    # A soft ramp retains cyan/purple glow and beveled antialiasing while making
    # every untouched backdrop pixel fully transparent.
    alpha = smoothstep(5.0, 58.0, signal)
    alpha = np.power(alpha, 0.72)
    alpha[signal < 4.5] = 0.0

    # Recover approximately un-premultiplied foreground colours against the fitted
    # navy background. The lower bound avoids amplifying noise in faint glow pixels.
    safe_alpha = np.maximum(alpha[..., None], 0.08)
    foreground = (source - backdrop * (1.0 - alpha[..., None])) / safe_alpha
    foreground = np.clip(foreground, 0.0, 255.0)
    foreground[alpha <= 0.0] = 0.0

    alpha_u8 = np.round(alpha * 255.0).astype(np.uint8)
    foreground_u8 = np.round(foreground).astype(np.uint8)
    rgba = np.dstack([foreground_u8, alpha_u8])

    visible_y, visible_x = np.where(alpha_u8 > 2)
    if not visible_x.size:
        raise RuntimeError("No foreground pixels were extracted")

    padding = 24
    left = max(0, int(visible_x.min()) - padding)
    right = min(width, int(visible_x.max()) + padding + 1)
    top = max(0, int(visible_y.min()) - padding)
    bottom = min(height, int(visible_y.max()) + padding + 1)
    cropped = rgba[top:bottom, left:right]

    Image.fromarray(cropped, mode="RGBA").save(OUTPUT, optimize=True)
    transparent = int(np.count_nonzero(cropped[..., 3] == 0))
    print(
        {
            "output": str(OUTPUT),
            "mode": "RGBA",
            "size": (cropped.shape[1], cropped.shape[0]),
            "alpha_extrema": (int(cropped[..., 3].min()), int(cropped[..., 3].max())),
            "transparent_pixels": transparent,
        }
    )


if __name__ == "__main__":
    main()
