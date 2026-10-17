import { getFont } from './presets.mjs';

export const HEAD_LH = 1.14;
export const SUB_LH = 1.4;

/** `The list that *feels* like a *notebook.*` → words tagged with their highlight span (-1 = plain). */
export function parseMarkup(text) {
  const words = [];
  const parts = String(text ?? '').split('*');
  parts.forEach((part, i) => {
    const inSpan = i % 2 === 1 && i < parts.length - 1;
    const span = inSpan ? (i - 1) / 2 : -1;
    for (const t of part.split(/\s+/)) if (t) words.push({ text: t, span });
  });
  return words;
}

export const stripMarkup = (text) => parseMarkup(text).map((w) => w.text).join(' ');

/** Greedy word wrap. `ctx` only needs `measureText(text).width`. */
export function wrap(ctx, words, maxWidth) {
  if (!words.length) return [];
  const space = ctx.measureText(' ').width;
  const lines = [];
  let line = { words: [], widths: [], width: 0 };
  for (const word of words) {
    const ww = ctx.measureText(word.text).width;
    const next = line.words.length ? line.width + space + ww : ww;
    if (line.words.length && next > maxWidth) {
      lines.push(line);
      line = { words: [word], widths: [ww], width: ww };
    } else {
      line.words.push(word);
      line.widths.push(ww);
      line.width = next;
    }
  }
  lines.push(line);
  return lines;
}

/** Height the text block may use before it would collide with the device band. */
export function availableTextHeight(layout, h) {
  if (!layout.text) return 0;
  const textBelowDevice = layout.text.top > layout.device.top;
  const limit = textBelowDevice ? 1 - layout.text.top - 0.03 : layout.device.top - layout.text.top - 0.02;
  return Math.max(layout.text.height, limit) * h;
}

export function setHeadFont(ctx, size, settings) {
  ctx.font = `700 ${size}px ${getFont(settings.fontId).stack}`;
  ctx.letterSpacing = `${size * settings.headlineTracking}px`;
}

export function setSubFont(ctx, size, settings) {
  ctx.font = `400 ${size}px ${getFont(settings.fontId).stack}`;
  ctx.letterSpacing = '0px';
}

export const blockHeight = ({ headLines, headSize, subLines, subSize, gap }) =>
  headLines.length * headSize * HEAD_LH + (subLines.length ? gap + subLines.length * subSize * SUB_LH : 0);

/** Shrinks the type ×0.94 up to 30 times until the block fits `maxHeight`. */
export function layoutText(ctx, screen, settings, maxWidth, maxHeight, h) {
  let headSize = h * 0.04 * settings.headlineScale;
  let subSize = h * 0.0205 * settings.subheadScale;
  const gap = h * 0.018;
  const headWords = parseMarkup(screen.headline);
  const subWords = parseMarkup(screen.subhead);
  for (let i = 0; i < 30; i++) {
    setHeadFont(ctx, headSize, settings);
    const headLines = wrap(ctx, headWords, maxWidth);
    setSubFont(ctx, subSize, settings);
    const subLines = wrap(ctx, subWords, maxWidth);
    const candidate = { headSize, subSize, headLines, subLines, gap };
    if (blockHeight(candidate) <= maxHeight || headSize < h * 0.014) return candidate;
    headSize *= 0.94;
    subSize *= 0.94;
  }
  return { headSize, subSize, headLines: [], subLines: [], gap };
}

/** One line at `y` (top of the em box), with one marker band per run of same-span words. */
export function drawLine(ctx, line, x0, y, size, highlights) {
  const space = ctx.measureText(' ').width;
  const xs = [];
  let x = x0;
  line.words.forEach((_, i) => { xs.push(x); x += line.widths[i] + space; });

  if (highlights.length) {
    const pad = size * 0.07;
    let i = 0;
    while (i < line.words.length) {
      const span = line.words[i].span;
      let j = i;
      while (j + 1 < line.words.length && line.words[j + 1].span === span) j++;
      if (span >= 0) {
        const left = xs[i] - pad;
        const right = xs[j] + line.widths[j] + pad;
        ctx.save();
        ctx.fillStyle = highlights[span % highlights.length];
        ctx.beginPath();
        ctx.roundRect(left, y + size * 0.1, right - left, size * 0.98, size * 0.07);
        ctx.fill();
        ctx.restore();
      }
      i = j + 1;
    }
  }
  line.words.forEach((word, i) => ctx.fillText(word.text, xs[i], y));
}

export function drawTextBlock(ctx, W, tileW, h, layout, screen, settings) {
  if (!layout.text || (!screen.headline && !screen.subhead)) return;
  const boxLeft = layout.text.left !== undefined ? W * layout.text.left : tileW * layout.padX;
  const maxWidth = layout.text.width !== undefined ? W * layout.text.width : tileW * (1 - layout.padX * 2);
  const bandTop = layout.text.top * h;
  const bandHeight = layout.text.height * h;
  const block = layoutText(ctx, screen, settings, maxWidth, availableTextHeight(layout, h), h);
  const { headSize, subSize, headLines, subLines, gap } = block;

  let y = bandTop + (bandHeight - blockHeight(block)) / 2;
  const startX = (lineWidth) => (settings.textAlign === 'left' ? boxLeft : boxLeft + (maxWidth - lineWidth) / 2);

  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = settings.textColor;
  setHeadFont(ctx, headSize, settings);
  for (const line of headLines) {
    drawLine(ctx, line, startX(line.width), y, headSize, settings.highlights);
    y += headSize * HEAD_LH;
  }
  if (subLines.length) {
    y += gap;
    ctx.globalAlpha = 0.72;
    setSubFont(ctx, subSize, settings);
    for (const line of subLines) {
      drawLine(ctx, line, startX(line.width), y, subSize, []);
      y += subSize * SUB_LH;
    }
  }
  ctx.restore();
}
