// Turns the user's choices into the flat boolean/string context every template sees.
// Keep this the single place that knows what a choice implies.

export const GROUPS = {
  workflow: ['bare', 'expo'],
  state: ['rtk', 'zustand', 'none'],
  data: ['rtk-query', 'tanstack-query', 'fetch'],
  nav: ['react-navigation', 'expo-router'],
  styling: ['nativewind', 'unistyles', 'stylesheet'],
  storage: ['mmkv', 'async-storage', 'none'],
  forms: ['rhf-zod', 'none'],
  i18n: ['i18next', 'none'],
  lists: ['flash-list', 'flatlist'],
  sample: ['yes', 'no'],
  store: ['yes', 'no'],
};
export const MODULES = ['crash', 'analytics', 'roles', 'media', 'push'];

export const DEFAULTS = {
  workflow: 'bare', state: 'rtk', data: 'rtk-query', nav: 'react-navigation', styling: 'nativewind',
  storage: 'mmkv', forms: 'rhf-zod', i18n: 'i18next', lists: 'flash-list', sample: 'yes', store: 'yes',
  modules: ['crash', 'analytics'],
};

export const PRESETS = {
  standard: { ...DEFAULTS },
  expo: { ...DEFAULTS, workflow: 'expo', nav: 'expo-router', state: 'zustand', data: 'tanstack-query' },
  minimal: { ...DEFAULTS, state: 'none', data: 'fetch', styling: 'stylesheet', storage: 'none', forms: 'none', i18n: 'none', lists: 'flatlist', sample: 'no', store: 'no', modules: [] },
};

export function normalizeChoices(input) {
  const c = { ...DEFAULTS, ...input };
  if (c.workflow !== 'expo' && c.nav === 'expo-router') throw new Error('expo-router needs --workflow=expo');
  if (c.state === 'rtk' && c.data === 'rtk-query') { /* ok */ }
  if (c.state !== 'rtk' && c.data === 'rtk-query') c.data = 'tanstack-query';
  if (c.state === 'rtk' && c.data === 'tanstack-query') c.data = 'rtk-query';
  if (!Array.isArray(c.modules)) c.modules = String(c.modules ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  for (const [g, allowed] of Object.entries(GROUPS)) if (!allowed.includes(c[g])) throw new Error(`--${g} must be one of ${allowed.join(', ')}`);
  for (const m of c.modules) if (!MODULES.includes(m)) throw new Error(`--modules: unknown module "${m}" (${MODULES.join(', ')})`);
  return c;
}

export function buildContext({ name, slug, bundleId, choices, versions, row, pm }) {
  const c = choices;
  const has = (m) => c.modules.includes(m);
  const ctx = {
    APP_NAME: name,
    APP_SLUG: slug,
    BUNDLE_ID: bundleId,
    DISPLAY_NAME: name,
    PM: pm,
    RN_VERSION: versions.rn,
    RN_MINOR: versions.rn?.split('.').slice(0, 2).join('.'),
    NODE_MIN: row?.node ?? '22.13.0',
    MIN_SDK: row?.minSdk ?? 24,
    IOS_TARGET: row?.iosTarget ?? '15.1',
    JDK: row?.jdk ?? 17,
    DATE: new Date().toISOString().slice(0, 10),

    bare: c.workflow === 'bare',
    expo: c.workflow === 'expo',
    rtk: c.state === 'rtk',
    zustand: c.state === 'zustand',
    noState: c.state === 'none',
    rtkQuery: c.data === 'rtk-query',
    tanstack: c.data === 'tanstack-query',
    plainFetch: c.data === 'fetch',
    reactNavigation: c.nav === 'react-navigation',
    expoRouter: c.nav === 'expo-router',
    nativewind: c.styling === 'nativewind',
    unistyles: c.styling === 'unistyles',
    stylesheet: c.styling === 'stylesheet',
    mmkv: c.storage === 'mmkv',
    asyncStorage: c.storage === 'async-storage',
    noStorage: c.storage === 'none',
    storage: c.storage !== 'none',
    rhf: c.forms === 'rhf-zod',
    noForms: c.forms === 'none',
    i18n: c.i18n === 'i18next',
    noI18n: c.i18n === 'none',
    flashList: c.lists === 'flash-list',
    flatList: c.lists === 'flatlist',
    sample: c.sample === 'yes',
    noSample: c.sample === 'no',
    store: c.store === 'yes',
    crash: has('crash'),
    analytics: has('analytics'),
    roles: has('roles'),
    media: has('media'),
    push: has('push'),
  };
  ctx.persist = ctx.storage && (ctx.rtk || ctx.zustand);
  ctx.reduxPersist = ctx.rtk && ctx.storage;
  ctx.queryClient = ctx.tanstack;
  ctx.sampleRtk = ctx.sample && ctx.rtk;
  ctx.sampleZustand = ctx.sample && ctx.zustand;
  ctx.sampleNoState = ctx.sample && ctx.noState;
  ctx.sampleNav = ctx.sample && ctx.reactNavigation;
  ctx.sampleRouter = ctx.sample && ctx.expoRouter;
  ctx.sampleForms = ctx.sample && ctx.rhf;
  ctx.navRoles = ctx.reactNavigation && ctx.roles;
  ctx.routerRoles = ctx.expoRouter && ctx.roles;
  ctx.v = versions;
  return ctx;
}

export const slugify = (name) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
