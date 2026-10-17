// Path rules for the GUI's store endpoints: which renderer modules the page may import, which
// project directories a request may name, and which files inside one it may read or write.
import { isAbsolute, resolve } from 'node:path';
import { safePath } from './store/fastlane.mjs';

export const STORE_MODULES = ['presets', 'text', 'frames', 'scene'];

/** `/store/<name>.mjs` → the module name, or null for anything off the allow-list. */
export function storeModuleName(pathname) {
  const m = /^\/store\/([a-z]+)\.mjs$/.exec(pathname);
  return m && STORE_MODULES.includes(m[1]) ? m[1] : null;
}

/** An absolute project directory with no `..` segments, as a resolved path. */
export function projectDir(input) {
  if (typeof input !== 'string' || !input.trim()) throw new Error('project is required');
  const p = input.trim();
  if (!isAbsolute(p) && !/^[a-zA-Z]:[\\/]/.test(p)) throw new Error('project must be an absolute path');
  if (p.split(/[\\/]/).some((seg) => seg === '..')) throw new Error('project must not contain ..');
  return resolve(p);
}

const IMAGE_EXT = /\.(png|jpe?g)$/i;

/** A project-relative image path, resolved inside the project; only png/jpeg may be served. */
export function shotPath(project, rel) {
  const abs = safePath(projectDir(project), rel);
  if (!IMAGE_EXT.test(abs)) throw new Error('only .png, .jpg and .jpeg files are served');
  return abs;
}

export const imageType = (abs) => (/\.png$/i.test(abs) ? 'image/png' : 'image/jpeg');
