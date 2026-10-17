/** ctx.roundRect with an arcTo fallback for canvases that lack it. */
export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const roundBox = (ctx, b, r) => roundRectPath(ctx, b.x, b.y, b.w, b.h, r);

export const imageSize = (img) => ({
  w: img.naturalWidth || img.videoWidth || img.width || 0,
  h: img.naturalHeight || img.videoHeight || img.height || 0,
});

/** Cover-fit an image into a box, anchored to the top so the status bar is never cropped. */
export function drawCoverTop(ctx, img, b) {
  const { w: iw, h: ih } = imageSize(img);
  if (!iw || !ih) return;
  const scale = Math.max(b.w / iw, b.h / ih);
  const dw = iw * scale, dh = ih * scale;
  ctx.drawImage(img, b.x + (b.w - dw) / 2, b.y, dw, dh);
}

function drawNotch(ctx, screen, device, frameW) {
  ctx.fillStyle = '#08080a';
  if (device.notch === 'island') {
    const w = frameW * 0.3, h = frameW * 0.085;
    roundBox(ctx, { x: screen.x + (screen.w - w) / 2, y: screen.y + frameW * 0.028, w, h }, h / 2);
    ctx.fill();
  } else if (device.notch === 'punch') {
    ctx.beginPath();
    ctx.arc(screen.x + screen.w / 2, screen.y + frameW * 0.055, frameW * 0.026, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** `box` is the outer frame bounds, already fitted to the frame's aspect by the caller. */
export function drawDevice(ctx, box, device, color, img) {
  const outerR = device.radius * box.w;
  const bezel = device.bezel * box.w;
  const screen = { x: box.x + bezel, y: box.y + bezel, w: box.w - bezel * 2, h: box.h - bezel * 2 };
  const screenR = Math.max(0, outerR - bezel);

  ctx.save();
  ctx.shadowColor = 'rgba(15, 23, 42, 0.30)';
  ctx.shadowBlur = box.w * 0.09;
  ctx.shadowOffsetY = box.w * 0.035;
  ctx.fillStyle = bezel > 0 ? color.body : '#ffffff';
  roundBox(ctx, box, outerR);
  ctx.fill();
  ctx.restore();

  if (bezel > 0) {
    ctx.save();
    ctx.strokeStyle = color.edge;
    ctx.lineWidth = Math.max(1, box.w * 0.005);
    const lw = ctx.lineWidth;
    roundBox(ctx, { x: box.x + lw / 2, y: box.y + lw / 2, w: box.w - lw, h: box.h - lw }, outerR);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  roundBox(ctx, screen, screenR);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(screen.x, screen.y, screen.w, screen.h);
  if (img) drawCoverTop(ctx, img, screen);
  drawNotch(ctx, screen, device, box.w);
  ctx.restore();
}
