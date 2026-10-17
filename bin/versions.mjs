#!/usr/bin/env node
// rn-versions: resolve only. Prints the versions a kickstart would use, as JSON or package.json.
import { GROUPS, normalizeChoices } from '../src/context.mjs';
import { keysFor, resolveAll, rnCeilingForXcode } from '../src/resolver/index.mjs';
import { detectXcode } from '../src/detect.mjs';
import { buildPackageJson } from '../src/packagejson.mjs';

const argv = process.argv.slice(2);
const flag = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const choices = normalizeChoices(Object.fromEntries([...Object.keys(GROUPS), 'modules'].map((g) => [g, flag(g)]).filter(([, v]) => v != null)));
const keys = keysFor(choices);
const { versions, warnings, row } = await resolveAll(keys, { rnCeiling: flag('rn') ?? rnCeilingForXcode(detectXcode()?.version), workflow: choices.workflow });
for (const w of warnings) console.error('warn:', w);
if (argv.includes('--package-json')) console.log(JSON.stringify(buildPackageJson({ name: 'App', slug: 'app', keys, versions, choices, row, pm: 'npm' }), null, 2));
else console.log(JSON.stringify(versions, null, 2));
