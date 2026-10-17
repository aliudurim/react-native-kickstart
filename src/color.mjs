const on = process.env.FORCE_COLOR ? true : process.env.NO_COLOR ? false : !!process.stdout.isTTY;
const wrap = (code) => (s) => (on ? `\u001b[${code}m${s}\u001b[0m` : String(s));
export const bold = wrap('1');
export const dim = wrap('2');
export const green = wrap('32');
export const yellow = wrap('33');
export const red = wrap('31');
export const cyan = wrap('36');
