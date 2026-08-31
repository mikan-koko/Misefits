from pathlib import Path
import math
import os

import imageio.v2 as imageio
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageSequence


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
# リールの素材。既定は assets/ 配下を見る。別の場所に置いている場合は環境変数で上書きする
#   例: set MISEFITS_REEL_HERO=C:\Users\me\Downloads\01_hero_top.jpg
HERO = Path(os.environ.get("MISEFITS_REEL_HERO") or ASSETS / "reel-source-hero.jpg")
GIF = Path(os.environ.get("MISEFITS_REEL_GIF") or ASSETS / "reel-source-anim.gif")
OUT_MP4 = ASSETS / "misefits-instagram-reel-1080x1920.mp4"
OUT_COVER = ASSETS / "misefits-instagram-reel-cover-1080x1920.jpg"

W, H = 1080, 1920
FPS = 30
DURATION = 10.0


def font(size, bold=False, italic=False):
    candidates = []
    if bold and italic:
        candidates += [
            r"C:\Windows\Fonts\Arialbi.ttf",
            r"C:\Windows\Fonts\arialbi.ttf",
        ]
    if bold:
        candidates += [
            r"C:\Windows\Fonts\Arialbd.ttf",
            r"C:\Windows\Fonts\arialbd.ttf",
            r"C:\Windows\Fonts\YuGothB.ttc",
        ]
    candidates += [
        r"C:\Windows\Fonts\arial.ttf",
        r"C:\Windows\Fonts\YuGothM.ttc",
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def jp_font(size, bold=False):
    candidates = [
        r"C:\\Windows\\Fonts\\YuGothB.ttc" if bold else r"C:\\Windows\\Fonts\\YuGothM.ttc",
        r"C:\\Windows\\Fonts\\meiryob.ttc" if bold else r"C:\\Windows\\Fonts\\meiryo.ttc",
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return font(size, bold=bold)


def cover_crop(img, size, focus=(0.5, 0.5)):
    tw, th = size
    iw, ih = img.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(iw * scale + 0.5), int(ih * scale + 0.5)
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    fx, fy = focus
    left = int((nw - tw) * fx)
    top = int((nh - th) * fy)
    left = max(0, min(left, nw - tw))
    top = max(0, min(top, nh - th))
    return resized.crop((left, top, left + tw, top + th))


def fit_inside(img, box):
    bw, bh = box
    iw, ih = img.size
    scale = min(bw / iw, bh / ih)
    return img.resize((int(iw * scale), int(ih * scale)), Image.Resampling.LANCZOS)


def rounded_rect_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def paste_card(base, img, xy, size, radius=34, shadow=True):
    x, y = xy
    card = cover_crop(img, size)
    mask = rounded_rect_mask(size, radius)
    if shadow:
        sh = Image.new("RGBA", size, (0, 0, 0, 92))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(16)))
        base.alpha_composite(sh, (x, y + 14))
    card_rgba = card.convert("RGBA")
    card_rgba.putalpha(mask)
    base.alpha_composite(card_rgba, (x, y))
    border = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(border)
    d.rounded_rectangle((1, 1, size[0] - 2, size[1] - 2), radius=radius, outline=(18, 118, 211, 70), width=2)
    base.alpha_composite(border, (x, y))


def paste_fit_card(base, img, xy, size, radius=34, shadow=True, bg=(255, 255, 255, 245)):
    x, y = xy
    mask = rounded_rect_mask(size, radius)
    if shadow:
        sh = Image.new("RGBA", size, (0, 0, 0, 86))
        sh.putalpha(mask.filter(ImageFilter.GaussianBlur(18)))
        base.alpha_composite(sh, (x, y + 16))
    card = Image.new("RGBA", size, bg)
    fitted = fit_inside(img, (size[0] - 34, size[1] - 34)).convert("RGBA")
    fx = (size[0] - fitted.size[0]) // 2
    fy = (size[1] - fitted.size[1]) // 2
    card.alpha_composite(fitted, (fx, fy))
    card.putalpha(mask)
    base.alpha_composite(card, (x, y))
    border = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(border)
    d.rounded_rectangle((1, 1, size[0] - 2, size[1] - 2), radius=radius, outline=(18, 118, 211, 92), width=2)
    base.alpha_composite(border, (x, y))


def draw_text_panel(draw, text, xy, width, alpha=1.0):
    x, y = xy
    text_font = jp_font(35, bold=True)
    max_text_width = width - 84
    lines = []
    current = ""
    for ch in text:
        test = current + ch
        if draw.textbbox((0, 0), test, font=text_font)[2] <= max_text_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = ch
    if current:
        lines.append(current)
    lines = lines[:2]
    panel_h = 110 if len(lines) == 1 else 152
    fill_a = int(236 * alpha)
    outline_a = int(84 * alpha)
    text_a = int(255 * alpha)
    draw.rounded_rectangle((x, y, x + width, y + panel_h), radius=38, fill=(255, 255, 255, fill_a), outline=(18, 118, 211, outline_a), width=2)
    text_y = y + 32 if len(lines) == 1 else y + 26
    for idx, line in enumerate(lines):
        draw.text((x + 42, text_y + idx * 46), line, font=text_font, fill=(16, 32, 51, text_a))


def draw_logo(draw, x, y, scale=1.0):
    logo_font = font(int(88 * scale), bold=True)
    logo_font_i = font(int(88 * scale), bold=True, italic=True)
    sub_font = jp_font(int(28 * scale), bold=True)
    draw.text((x, y), "Mise", font=logo_font, fill=(54, 66, 86))
    draw.text((x + int(184 * scale), y), "Fits", font=logo_font_i, fill=(20, 116, 216))
    draw.ellipse(
        (x + int(368 * scale), y + int(15 * scale), x + int(391 * scale), y + int(38 * scale)),
        fill=(247, 177, 82),
    )
    subtitle = "\u304b\u3093\u305f\u3093\u5e97\u8217\u30ec\u30a4\u30a2\u30a6\u30c8\u30b7\u30df\u30e5\u30ec\u30fc\u30bf\u30fc"
    draw.text((x + int(2 * scale), y + int(95 * scale)), subtitle, font=sub_font, fill=(96, 110, 132))


def base_frame(hero, t):
    # Product-ad style background: blurred app scene, blue depth, and ruler-like motion lines.
    focus_x = 0.43 + 0.04 * math.sin(t * 0.55)
    scene = cover_crop(hero, (W, H), (focus_x, 0.48)).filter(ImageFilter.GaussianBlur(14)).convert("RGBA")
    bg = Image.new("RGBA", (W, H), (8, 34, 82, 255))
    bg.alpha_composite(scene)
    bg.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, 126)))

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((0, 0, W, H), fill=(10, 77, 154, 48))
    od.polygon([(0, 0), (W, 0), (W, 410), (0, 640)], fill=(18, 118, 211, 66))
    od.polygon([(0, H - 450), (W, H - 650), (W, H), (0, H)], fill=(0, 92, 190, 70))
    for k in range(-2, 8):
        y = int(210 + k * 255 + 18 * math.sin(t * 0.9 + k))
        od.line((52, y + 22, W - 54, y - 173), fill=(255, 255, 255, 46), width=2)
    for x in (72, W - 88):
        od.line((x, 0, x, H), fill=(255, 255, 255, 74), width=2)
    bg.alpha_composite(overlay)
    return bg


def make_logo_plate():
    plate = Image.new("RGBA", (920, 250), (255, 255, 255, 246))
    mask = rounded_rect_mask(plate.size, 44)
    plate.putalpha(mask)
    d = ImageDraw.Draw(plate)
    icon = Image.open(ASSETS / "misefits-icon.png").convert("RGBA").resize((138, 138), Image.Resampling.LANCZOS)
    plate.alpha_composite(icon, (52, 55))
    draw_logo(d, 225, 45, 1.0)
    return plate


def main():
    hero = Image.open(HERO).convert("RGB")
    gif = Image.open(GIF)
    gif_frames = [frame.convert("RGB") for frame in ImageSequence.Iterator(gif)]
    if not gif_frames:
        gif_frames = [hero]
    logo_plate = make_logo_plate()

    cover = base_frame(hero, 0)
    paste_fit_card(cover, hero, (72, 630), (936, 596), radius=38)
    shadow = Image.new("RGBA", logo_plate.size, (0, 0, 0, 60))
    shadow.putalpha(logo_plate.getchannel("A").filter(ImageFilter.GaussianBlur(14)))
    cover.alpha_composite(shadow, (80, 266))
    cover.alpha_composite(logo_plate, (80, 246))
    cover.convert("RGB").save(OUT_COVER, quality=94, subsampling=0)

    total = int(DURATION * FPS)
    writer = imageio.get_writer(
        OUT_MP4,
        fps=FPS,
        codec="libx264",
        quality=8,
        macro_block_size=1,
        output_params=["-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    )
    try:
        for i in range(total):
            t = i / FPS
            frame = base_frame(hero, t)
            d = ImageDraw.Draw(frame)
            if t < 2.2:
                zoom = 1.0 + 0.035 * (t / 2.2)
                card_w, card_h = int(930 * zoom), int(590 * zoom)
                paste_fit_card(frame, hero, ((W - card_w) // 2, 680), (card_w, card_h), radius=38)
                y = int(250 - 18 * min(t / 1.1, 1))
                frame.alpha_composite(shadow, (80, y + 20))
                frame.alpha_composite(logo_plate, (80, y))
                draw_text_panel(
                    d,
                    "\u5c0f\u3055\u306a\u73fe\u5834\u306e\u30ec\u30a4\u30a2\u30a6\u30c8\u3092\u3001\u3055\u3063\u3068\u691c\u8a0e",
                    (126, 1332),
                    828,
                    alpha=min(t / 0.7, 1),
                )
            elif t < 7.8:
                local = t - 2.2
                idx = int(local * 12) % len(gif_frames)
                gif_img = gif_frames[idx]
                card_h = 650
                card_w = 930
                y = 545 + int(14 * math.sin(local * 1.2))
                paste_fit_card(frame, gif_img, (75, y), (card_w, card_h), radius=36)
                small_logo = logo_plate.resize((720, 196), Image.Resampling.LANCZOS)
                frame.alpha_composite(small_logo, (180, 220))
                if local < 2.8:
                    caption = "\u767d\u7d19\u304b\u3089\u3082\u3001\u56f3\u9762\u304b\u3089\u3082\u59cb\u3081\u3089\u308c\u308b"
                else:
                    caption = "\u4ec0\u5668\u3092\u7f6e\u3044\u3066\u3001\u901a\u8def\u3084\u5e2d\u6570\u3092\u78ba\u8a8d"
                draw_text_panel(d, caption, (126, 1274), 828, alpha=1)
            else:
                local = min((t - 7.8) / 2.2, 1)
                paste_fit_card(frame, hero, (72, 655), (936, 596), radius=38)
                scale = 0.86 + 0.14 * local
                lp = logo_plate.resize((int(920 * scale), int(250 * scale)), Image.Resampling.LANCZOS)
                x = (W - lp.size[0]) // 2
                y = int(288 - 24 * local)
                frame.alpha_composite(lp, (x, y))
                draw_text_panel(
                    d,
                    "\u30d6\u30e9\u30a6\u30b6\u3060\u3051\u3067\u3001\u5e97\u8217\u30ec\u30a4\u30a2\u30a6\u30c8\u3092\u8a66\u305b\u308b",
                    (92, 1350),
                    896,
                    alpha=local,
                )
            writer.append_data(np.asarray(frame.convert("RGB")))
    finally:
        writer.close()

    print(OUT_MP4)
    print(OUT_COVER)


if __name__ == "__main__":
    main()
