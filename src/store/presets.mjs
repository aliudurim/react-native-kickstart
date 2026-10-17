// Pure data shared by the headless renderer and the GUI. Browser-safe: no Node imports.

export const DEVICES = [
  { id: 'iphone-17-pro', label: 'iPhone 17 Pro', group: 'iPhone', screenAspect: 1320 / 2868, bezel: 0.030, radius: 0.150, notch: 'island' },
  { id: 'iphone-17', label: 'iPhone 17', group: 'iPhone', screenAspect: 1206 / 2622, bezel: 0.032, radius: 0.150, notch: 'island' },
  { id: 'iphone-se', label: 'iPhone SE', group: 'iPhone', screenAspect: 750 / 1334, bezel: 0.045, radius: 0.095, notch: 'none' },
  { id: 'ipad-13', label: 'iPad Pro 13"', group: 'iPad', screenAspect: 2064 / 2752, bezel: 0.026, radius: 0.055, notch: 'none' },
  { id: 'pixel-9-pro', label: 'Pixel 9 Pro', group: 'Android', screenAspect: 1280 / 2856, bezel: 0.026, radius: 0.085, notch: 'punch' },
  { id: 'pixel-9-pro-xl', label: 'Pixel 9 Pro XL', group: 'Android', screenAspect: 1344 / 2992, bezel: 0.025, radius: 0.085, notch: 'punch' },
  { id: 'pixel-8a', label: 'Pixel 8a', group: 'Android', screenAspect: 1080 / 2400, bezel: 0.040, radius: 0.075, notch: 'punch' },
  { id: 'galaxy-s25-ultra', label: 'Galaxy S25 Ultra', group: 'Android', screenAspect: 1440 / 3120, bezel: 0.022, radius: 0.045, notch: 'punch' },
  { id: 'galaxy-s25', label: 'Galaxy S25', group: 'Android', screenAspect: 1080 / 2340, bezel: 0.026, radius: 0.090, notch: 'punch' },
  { id: 'galaxy-a56', label: 'Galaxy A56', group: 'Android', screenAspect: 1080 / 2340, bezel: 0.038, radius: 0.080, notch: 'punch' },
  { id: 'android-tablet', label: 'Android tablet', group: 'Android', screenAspect: 1600 / 2560, bezel: 0.030, radius: 0.050, notch: 'none' },
  { id: 'none', label: 'No frame', group: 'Other', screenAspect: 1320 / 2868, bezel: 0, radius: 0.045, notch: 'none' },
];

export const DEVICE_GROUPS = ['iPhone', 'iPad', 'Android', 'Other'];

export const FRAME_COLORS = [
  { id: 'deep-blue', label: 'Deep Blue', body: '#28344a', edge: '#5b6b88' },
  { id: 'black', label: 'Black', body: '#1c1c1e', edge: '#4a4a4e' },
  { id: 'silver', label: 'Silver', body: '#c9ccd2', edge: '#f2f3f5' },
  { id: 'gold', label: 'Desert Gold', body: '#bda182', edge: '#e8d6be' },
  { id: 'porcelain', label: 'Porcelain', body: '#e8e4dc', edge: '#fbf9f5' },
  { id: 'mint', label: 'Mint', body: '#9fb8a8', edge: '#cfe0d5' },
];

export const SOLID_PRESETS = [
  '#eaf2ff', '#fdeee4', '#e6f6ee', '#eeeaf9', '#fde9ef', '#fdf3d8', '#e8f4f6', '#f1f1f3',
  '#1e6ff5', '#f0502d', '#12885a', '#1f2937', '#7c3aed', '#db2777', '#0d9488', '#111114',
];

export const GRADIENT_PRESETS = [
  { kind: 'gradient', from: '#6366f1', to: '#a855f7', angle: 135 },
  { kind: 'gradient', from: '#0ea5e9', to: '#22d3ee', angle: 135 },
  { kind: 'gradient', from: '#f97316', to: '#ec4899', angle: 135 },
  { kind: 'gradient', from: '#10b981', to: '#84cc16', angle: 135 },
  { kind: 'gradient', from: '#1e293b', to: '#0f172a', angle: 160 },
  { kind: 'gradient', from: '#fda4af', to: '#fef3c7', angle: 150 },
  { kind: 'gradient', from: '#4f46e5', to: '#0f172a', angle: 200 },
  { kind: 'gradient', from: '#e0f2fe', to: '#ede9fe', angle: 135 },
];

// Vertical fractions are of the tile height, horizontal ones of the composition width (tile × span).
export const LAYOUTS = [
  { id: 'text-top', label: 'Text above', span: 1, text: { top: 0.065, height: 0.165 }, device: { top: 0.27, bottom: 0.95 }, padX: 0.09 },
  { id: 'text-bottom', label: 'Text below', span: 1, text: { top: 0.76, height: 0.165 }, device: { top: 0.06, bottom: 0.72 }, padX: 0.09 },
  { id: 'bleed', label: 'Bleed off edge', span: 1, text: { top: 0.07, height: 0.175 }, device: { top: 0.29, bottom: 1.14 }, padX: 0.07 },
  { id: 'editorial', label: 'Tall text', span: 1, text: { top: 0.07, height: 0.25 }, device: { top: 0.41, bottom: 1.12 }, padX: 0.085 },
  { id: 'hero', label: 'Hero', span: 1, text: { top: 0.06, height: 0.22 }, device: { top: 0.3, bottom: 1.3, width: 0.95, cy: 0.75 }, padX: 0.09 },
  { id: 'duo', label: 'Duo', span: 1, text: { top: 0.06, height: 0.22 }, device: { top: 0.3, bottom: 1.25, width: 0.7, cy: 0.74 }, padX: 0.09 },
  { id: 'panorama', label: 'Panorama', span: 2, text: { top: 0.07, height: 0.3, left: 0.045, width: 0.36 }, device: { top: 0.3, bottom: 1.3, width: 1.05, cx: 0.6, cy: 0.74 }, padX: 0.09 },
  { id: 'panorama-duo', label: 'Panorama duo', span: 2, text: { top: 0.06, height: 0.22, left: 0.1, width: 0.8 }, device: { top: 0.3, bottom: 1.25, width: 0.8, cy: 0.72 }, padX: 0.09 },
  { id: 'centered', label: 'Device only', span: 1, text: null, device: { top: 0.07, bottom: 0.93 }, padX: 0.1 },
];

// Placements draw back to front; dx/dy are fractions of composition width / tile height.
export const POSITIONS = [
  { id: 'center', label: 'Single', placements: [{ source: 'self', dx: 0, dy: 0, scale: 1, rotate: 0 }] },
  { id: 'tilted', label: 'Tilted', placements: [{ source: 'self', dx: 0, dy: 0, scale: 0.98, rotate: -7 }] },
  { id: 'offset', label: 'Offset', placements: [{ source: 'self', dx: 0.15, dy: 0.01, scale: 1.06, rotate: -4 }] },
  { id: 'right', label: 'Pushed right', placements: [{ source: 'self', dx: 0.12, dy: 0.02, scale: 1, rotate: 0 }] },
  { id: 'lean', label: 'Lean', placements: [{ source: 'self', dx: 0, dy: 0, scale: 1, rotate: 10 }] },
  { id: 'corner', label: 'Corner', placements: [{ source: 'self', dx: 0.14, dy: 0.03, scale: 1, rotate: 10 }] },
  { id: 'wings', label: 'Wings', placements: [
    { source: 'next', dx: 0.23, dy: 0, scale: 1, rotate: -6 },
    { source: 'self', dx: -0.23, dy: 0, scale: 1, rotate: 6 },
  ] },
  { id: 'duo', label: 'Duo', placements: [
    { source: 'next', dx: -0.18, dy: -0.05, scale: 0.88, rotate: 0 },
    { source: 'self', dx: 0.14, dy: 0.05, scale: 1, rotate: 0 },
  ] },
  { id: 'duo-tilt', label: 'Duo tilt', placements: [
    { source: 'next', dx: -0.18, dy: -0.06, scale: 0.9, rotate: -6 },
    { source: 'self', dx: 0.16, dy: 0.06, scale: 1, rotate: -6 },
  ] },
  { id: 'pair', label: 'Pair', placements: [
    { source: 'next', dx: 0.16, dy: -0.018, scale: 0.84, rotate: 7 },
    { source: 'self', dx: -0.09, dy: 0.018, scale: 0.94, rotate: -3 },
  ] },
  { id: 'trio', label: 'Trio', placements: [
    { source: 'prev', dx: -0.205, dy: 0.012, scale: 0.68, rotate: -11 },
    { source: 'next', dx: 0.205, dy: 0.012, scale: 0.68, rotate: 11 },
    { source: 'self', dx: 0, dy: -0.012, scale: 0.82, rotate: 0 },
  ] },
];

export const STEP = {
  classic: { layout: 'text-top', positionId: 'center', textAlign: 'center' },
  copyBelow: { layout: 'text-bottom', positionId: 'center', textAlign: 'center' },
  hero: { layout: 'hero', positionId: 'center', textAlign: 'center' },
  offset: { layout: 'hero', positionId: 'right', textAlign: 'left' },
  tilt: { layout: 'hero', positionId: 'tilted', textAlign: 'center' },
  tiltRight: { layout: 'hero', positionId: 'corner', textAlign: 'left' },
  duo: { layout: 'duo', positionId: 'duo', textAlign: 'center' },
  duoTilt: { layout: 'duo', positionId: 'duo-tilt', textAlign: 'center' },
  panorama: { layout: 'panorama', positionId: 'lean', textAlign: 'left' },
  panoramaDuo: { layout: 'panorama-duo', positionId: 'wings', textAlign: 'center' },
  minimal: { layout: 'centered', positionId: 'center' },
};

export const RHYTHMS = [
  { id: 'uniform', label: 'Uniform', description: 'Every tile in the same layout and arrangement.', steps: [] },
  { id: 'editorial', label: 'Editorial', description: 'A panorama opener, then a hero, an offset, a breather and a tilt.', steps: [STEP.panorama, STEP.hero, STEP.offset, STEP.minimal, STEP.tilt] },
  { id: 'showcase', label: 'Showcase', description: 'Hero first, then tilted and paired screens, ending on a breather.', steps: [STEP.hero, STEP.tilt, STEP.duo, STEP.tiltRight, STEP.minimal] },
  { id: 'magazine', label: 'Magazine', description: 'Left-aligned copy and copy-below tiles alternating with big devices.', steps: [STEP.offset, STEP.copyBelow, STEP.tiltRight, STEP.hero, STEP.minimal] },
  { id: 'storyboard', label: 'Storyboard', description: 'A two-screen panorama, then a copy-below, a hero and a breather.', steps: [STEP.panoramaDuo, STEP.copyBelow, STEP.hero, STEP.minimal, STEP.tilt] },
  { id: 'dynamic', label: 'Dynamic', description: 'Everything tilted: a tilt, a tilted pair, a panorama, a breather.', steps: [STEP.tilt, STEP.duoTilt, STEP.panorama, STEP.minimal, STEP.tiltRight] },
];

export const TEMPLATES = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'Centred headline over a framed device on a soft solid background. Clean, quick, safe.',
    settings: {},
    samples: [
      { headline: 'Everything in *one place*', subhead: 'Notes, tasks and files together.' },
      { headline: 'Plan the week in seconds', subhead: 'Drag, drop, done.' },
      { headline: 'Works *offline*, syncs later', subhead: '' },
    ],
  },
  {
    id: 'notebook',
    label: 'Notebook',
    description: 'Warm paper tones, a big left-aligned headline with marker highlights, and a phone that runs off the bottom.',
    settings: {
      background: { kind: 'solid', color: '#f3efe4' },
      backdropColor: '#ebe5d6',
      frameColorId: 'black',
      positionId: 'center',
      layout: 'editorial',
      tilt: 0,
      deviceScale: 0.86,
      textColor: '#23231f',
      textAlign: 'left',
      highlights: ['#e9c7c2', '#cfdbc1', '#efcfb9'],
      fontId: 'system',
      headlineScale: 1.5,
      subheadScale: 0.8,
      headlineTracking: -0.035,
    },
    variants: [
      { background: { kind: 'solid', color: '#f3efe4' }, backdropColor: '#ebe5d6', positionId: 'center', highlights: ['#e9c7c2', '#cfdbc1'] },
      { background: { kind: 'solid', color: '#f6eee5' }, backdropColor: '#e8d8c3', positionId: 'tilted', highlights: ['#efcfb9', '#cfdbc1'] },
      { background: { kind: 'solid', color: '#efeadb' }, backdropColor: null, positionId: 'offset', highlights: ['#e9c7c2', '#cfdbc1'] },
      { background: { kind: 'solid', color: '#ecd7d8' }, backdropColor: '#e3c6c8', positionId: 'tilted', highlights: ['#f0d5c4', '#cfdbc1'] },
      { background: { kind: 'solid', color: '#f3efe4' }, backdropColor: '#d6e0cd', positionId: 'center', highlights: ['#cfdbc1', '#e9c7c2'] },
    ],
    samples: [
      { headline: 'The list that *feels* like a *notebook.*', subhead: '' },
      { headline: 'Hands full? *Just say it.*', subhead: 'Tap once. Talk. Multiple items, quantities, brands, all in one breath.' },
      { headline: 'Turn pictures *into text*', subhead: '' },
      { headline: 'Import recipes from *apps* & websites', subhead: 'Bring recipes in from the places you already save them.' },
      { headline: 'One list. *Whole* household.', subhead: '' },
    ],
  },
  {
    id: 'editorial',
    label: 'Editorial',
    description: 'A two-tile panorama opener, then a hero, an offset, a device-only breather and a tilt. Cool gradient, deep-blue frame.',
    settings: {
      background: { kind: 'gradient', from: '#e8f1ff', to: '#ffffff', angle: 160 },
      frameColorId: 'deep-blue',
      layout: 'hero',
      positionId: 'center',
      textColor: '#0e1b2a',
      textAlign: 'center',
      highlights: ['#bfdbfe', '#fde68a'],
      fontId: 'system',
      headlineScale: 1.25,
      subheadScale: 0.9,
      headlineTracking: -0.025,
    },
    rhythm: 'editorial',
    variants: [
      { ...STEP.panorama },
      { ...STEP.hero },
      { ...STEP.offset, background: { kind: 'gradient', from: '#f7faff', to: '#e8f1ff', angle: 200 } },
      { ...STEP.minimal },
      { ...STEP.tilt },
    ],
    samples: [
      { headline: 'Your whole day, *one glance*', subhead: 'Calendar, tasks and notes, together at last.' },
      { headline: 'Capture *anything*', subhead: 'Text, voice or a photo, it lands in the right place.' },
      { headline: 'Plan the week in seconds', subhead: 'Drag, drop, done.' },
      { headline: '', subhead: '' },
      { headline: 'Works *offline*, syncs later', subhead: '' },
    ],
  },
];

const SYSTEM = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const FONTS = [
  { id: 'system', label: 'System', family: '', stack: SYSTEM },
  { id: 'inter', label: 'Inter', family: 'Inter', stack: `"Inter", ${SYSTEM}` },
  { id: 'dm-sans', label: 'DM Sans', family: 'DM Sans', stack: `"DM Sans", ${SYSTEM}` },
  { id: 'serif', label: 'Serif', family: '', stack: 'Georgia, "Times New Roman", serif' },
];

// Only the largest size per family is required; the stores downscale for the rest.
export const SIZES = [
  { id: 'iphone-6-9', label: 'iPhone 6.9"', store: 'App Store', platform: 'ios', w: 1320, h: 2868, kind: 'screenshot', device: 'iphone-17-pro' },
  { id: 'iphone-6-3', label: 'iPhone 6.3"', store: 'App Store', platform: 'ios', w: 1206, h: 2622, kind: 'screenshot', device: 'iphone-17' },
  { id: 'iphone-6-5', label: 'iPhone 6.5"', store: 'App Store', platform: 'ios', w: 1242, h: 2688, kind: 'screenshot', device: 'iphone-17-pro' },
  { id: 'ipad-13', label: 'iPad 13"', store: 'App Store', platform: 'ios', w: 2064, h: 2752, kind: 'screenshot', device: 'ipad-13' },
  { id: 'android-phone', label: 'Android phone', store: 'Google Play', platform: 'android', w: 1080, h: 1920, kind: 'screenshot', device: 'pixel-9-pro' },
  { id: 'android-phone-tall', label: 'Android phone (tall)', store: 'Google Play', platform: 'android', w: 1080, h: 2400, kind: 'screenshot', device: 'pixel-9-pro' },
  { id: 'android-tablet', label: 'Android tablet', store: 'Google Play', platform: 'android', w: 1600, h: 2560, kind: 'screenshot', device: 'android-tablet' },
  { id: 'feature-graphic', label: 'Play feature graphic', store: 'Google Play', platform: 'android', w: 1024, h: 500, kind: 'feature' },
  { id: 'play-icon', label: 'Play icon', store: 'Google Play', platform: 'android', w: 512, h: 512, kind: 'icon' },
];

export const STORE_LIMITS = {
  'App Store': { min: 1, max: 10 },
  'Google Play': { min: 2, max: 8 },
};

export const DEFAULT_SETTINGS = {
  background: { kind: 'solid', color: '#eaf2ff' },
  backdropColor: null,
  deviceId: 'iphone-17-pro',
  frameColorId: 'deep-blue',
  positionId: 'center',
  layout: 'text-top',
  tilt: 0,
  deviceScale: 1,
  textColor: '#111114',
  textAlign: 'center',
  highlights: ['#ffe27a'],
  fontId: 'system',
  headlineScale: 1,
  subheadScale: 1,
  headlineTracking: -0.01,
  sizeId: 'iphone-6-9',
};

const byId = (list) => (id) => list.find((x) => x.id === id) ?? list[0];
export const getDevice = byId(DEVICES);
export const getFrameColor = byId(FRAME_COLORS);
export const getLayout = byId(LAYOUTS);
export const getPosition = byId(POSITIONS);
export const getRhythm = byId(RHYTHMS);
export const getTemplate = byId(TEMPLATES);
export const getFont = byId(FONTS);
export const getSize = (id) => SIZES.find((s) => s.id === id) ?? null;

/** Outer frame aspect: the screen aspect plus the bezel on all four sides. */
export function frameAspect(d) {
  const screenW = 1 - 2 * d.bezel;
  return 1 / (screenW / d.screenAspect + 2 * d.bezel);
}

export const rhythmStep = (rhythm, index) => (rhythm.steps.length ? rhythm.steps[index % rhythm.steps.length] : null);
export const variantFor = (template, index) => (template.variants?.length ? { ...template.variants[index % template.variants.length] } : {});
