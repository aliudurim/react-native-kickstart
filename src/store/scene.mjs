import { frameAspect, getDevice, getFrameColor, getLayout, getPosition } from './presets.mjs';
import { drawTextBlock, layoutText, blockHeight, setHeadFont, setSubFont, drawLine, HEAD_LH, SUB_LH } from './text.mjs';
import { drawDevice, roundRectPath } from './frames.mjs';

/** A screen's own overrides win; everything else falls through to the global settings. */
export const effectiveSettings = (screen, settings) => ({ ...settings, ...(screen.overrides ?? {}) });

export function drawBackground(ctx, w, h, bg) {
  if (!bg || bg.kind === 'solid') {
    ctx.fillStyle = bg?.color ?? '#ffffff';
  } else {
    const rad = ((bg.angle - 90) * Math.PI) / 180;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const len = Math.abs(w * dx) + Math.abs(h * dy);
    const g = ctx.createLinearGradient(w / 2 - (dx * len) / 2, h / 2 - (dy * len) / 2, w / 2 + (dx * len) / 2, h / 2 + (dy * len) / 2);
    g.addColorStop(0, bg.from);
    g.addColorStop(1, bg.to);
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, w, h);
}

function drawBackdrop(ctx, W, tileW, h, layout, color) {
  const r = tileW * 0.075;
  const top = h * layout.device.top - h * 0.05;
  const bottom = layout.device.bottom > 1 ? h + r : Math.min(h + r, h * layout.device.bottom + h * 0.05);
  ctx.fillStyle = color;
  roundRectPath(ctx, tileW * 0.045, top, W - tileW * 0.09, bottom - top, r);
  ctx.fill();
}

/** Where every frame of a composition sits, back to front. `w`/`h` are one store tile. Pure. */
export function composeDevices(layout, positionId, w, h, aspect, deviceScale, tilt) {
  const W = w * layout.span;
  const slot = { x: w * layout.padX, y: h * layout.device.top, w: W - w * layout.padX * 2, h: h * (layout.device.bottom - layout.device.top) };
  const fitW = layout.device.width !== undefined ? w * layout.device.width : Math.min(slot.w, slot.h * aspect);
  const baseW = fitW * deviceScale;
  const cx = layout.device.cx !== undefined ? W * layout.device.cx : slot.x + slot.w / 2;
  const cy = layout.device.cy !== undefined ? h * layout.device.cy : slot.y + slot.h / 2;
  return getPosition(positionId).placements.map((p) => {
    const fw = baseW * p.scale;
    const fh = fw / aspect;
    return { box: { x: cx + p.dx * W - fw / 2, y: cy + p.dy * h - fh / 2, w: fw, h: fh }, source: p.source, angle: p.rotate + tilt };
  });
}

export const sceneSpan = (screen, settings) => getLayout(effectiveSettings(screen, settings).layout).span;

/**
 * `w`/`h` are the store tile size; a span-2 layout draws `2w` wide and the caller slices it.
 * `sources` maps self/next/prev to drawable images (missing neighbours fall back to self).
 */
export function renderScene(ctx, w, h, screen, settings, sources) {
  settings = effectiveSettings(screen, settings);
  const layout = getLayout(settings.layout);
  const W = w * layout.span;
  ctx.clearRect(0, 0, W, h);
  drawBackground(ctx, W, h, settings.background);
  if (settings.backdropColor) drawBackdrop(ctx, W, w, h, layout, settings.backdropColor);
  drawTextBlock(ctx, W, w, h, layout, screen, settings);

  const device = getDevice(settings.deviceId);
  const color = getFrameColor(settings.frameColorId);
  const boxes = composeDevices(layout, settings.positionId, w, h, frameAspect(device), settings.deviceScale, settings.tilt);
  for (const { box, source, angle } of boxes) {
    const img = sources[source] ?? sources.self ?? null;
    ctx.save();
    if (angle !== 0) {
      ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
    }
    drawDevice(ctx, box, device, color, img);
    ctx.restore();
  }
}

/** Play feature graphic (1024×500): copy on the left, a leaning device bleeding off the right. */
export function renderFeature(ctx, w, h, screen, settings, img) {
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, settings.background);
  const device = getDevice(settings.deviceId);
  const color = getFrameColor(settings.frameColorId);
  const hasText = !!(screen.headline || screen.subhead);
  const aspect = frameAspect(device);
  const fw = h * 0.9 * aspect * 1.25;
  const box = hasText ? { x: w * 0.66 - fw / 2, y: h * 0.14, w: fw, h: fw / aspect } : { x: (w - fw) / 2, y: h * 0.12, w: fw, h: fw / aspect };

  if (hasText) {
    const maxWidth = w * 0.5;
    const pseudo = { ...settings, headlineScale: settings.headlineScale * 2.1, subheadScale: settings.subheadScale * 2.2 };
    const block = layoutText(ctx, screen, pseudo, maxWidth, h * 0.8, h);
    let y = (h - blockHeight(block)) / 2;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = settings.textColor;
    setHeadFont(ctx, block.headSize, pseudo);
    for (const line of block.headLines) { drawLine(ctx, line, w * 0.06, y, block.headSize, settings.highlights); y += block.headSize * HEAD_LH; }
    if (block.subLines.length) {
      y += block.gap;
      ctx.globalAlpha = 0.72;
      setSubFont(ctx, block.subSize, pseudo);
      for (const line of block.subLines) { drawLine(ctx, line, w * 0.06, y, block.subSize, []); y += block.subSize * SUB_LH; }
    }
    ctx.restore();
  }
  ctx.save();
  if (hasText) {
    ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
    ctx.rotate((-8 * Math.PI) / 180);
    ctx.translate(-(box.x + box.w / 2), -(box.y + box.h / 2));
  }
  drawDevice(ctx, box, device, color, img);
  ctx.restore();
}
