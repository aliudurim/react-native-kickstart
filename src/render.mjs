// Line-based template engine: {{var}}, {{var.path}}, {{#if flag}} … {{else}} … {{/if}}, {{#unless flag}} … {{/unless}}.
// Block tags count only when alone on their line; that line is removed. Runs of 3+ blank lines collapse.

const BLOCK = /^\s*\{\{(#if|#unless|else|\/if|\/unless)(?:\s+([\w.]+))?\}\}\s*$/;

export function render(tmpl, ctx) {
  const out = [];
  const stack = [];
  const active = () => stack.every((s) => s.emit);
  for (const line of tmpl.split('\n')) {
    const m = BLOCK.exec(line);
    if (!m) {
      if (active()) out.push(line.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
        const v = lookup(ctx, path);
        if (v === undefined) throw new Error(`template variable "${path}" is undefined`);
        return String(v);
      }));
      continue;
    }
    const [, tag, name] = m;
    switch (tag) {
      case '#if': stack.push({ tag, emit: !!lookup(ctx, name) }); break;
      case '#unless': stack.push({ tag, emit: !lookup(ctx, name) }); break;
      case 'else': {
        const top = stack.at(-1);
        if (!top) throw new Error('{{else}} without an open block');
        top.emit = !top.emit; break;
      }
      case '/if':
      case '/unless': {
        const top = stack.pop();
        if (!top || top.tag !== (tag === '/if' ? '#if' : '#unless')) throw new Error(`unbalanced ${tag}`);
        break;
      }
    }
  }
  if (stack.length) throw new Error(`unclosed ${stack.at(-1).tag}`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function lookup(ctx, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}
