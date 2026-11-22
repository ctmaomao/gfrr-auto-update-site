import fs from 'node:fs';
import { after } from 'node:test';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const RENDER_URL = pathToFileURL(`${ROOT}/scripts/modules/renderMacroOverview.js`);
const RENDER_SOURCE = fs.readFileSync(RENDER_URL, 'utf8');
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]\s*;?/g;

export async function createMacroOverviewRenderVm(names) {
  const bindings = {};
  for (const match of RENDER_SOURCE.matchAll(IMPORT_RE)) {
    const module = await import(new URL(match[2], RENDER_URL).href);
    for (const name of match[1].split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!(name in module)) throw new Error(`missing real export ${name} from ${match[2]}`);
      bindings[name] = module[name];
    }
  }
  const elements = new Map();
  const elementFor = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        hidden: false,
        className: '',
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      });
    }
    return elements.get(id);
  };
  const documentStub = {
    getElementById: elementFor,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => elementFor(`created-${tag}`),
  };
  // Real imported helpers resolve document in the host realm, not in the VM.
  const hadDocument = Object.hasOwn(globalThis, 'document');
  const originalDocument = globalThis.document;
  after(() => {
    if (hadDocument) globalThis.document = originalDocument;
    else delete globalThis.document;
  });
  globalThis.document = documentStub;
  const body = RENDER_SOURCE
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export[ \t]+/gm, '');
  const sandbox = {
    document: documentStub,
    console: { error: (...args) => { throw new Error(`unexpected catch: ${args.map(String).join(' ')}`); } },
    setTimeout: () => {},
    clearTimeout: () => {},
    window: {},
    ...bindings,
  };
  const context = vm.createContext(sandbox);
  vm.runInContext(body, context, { filename: 'renderMacroOverview.vm.js' });
  const api = vm.runInContext(`({ ${names.join(', ')} })`, context);
  return { api, elementFor, renderSource: RENDER_SOURCE, renderUrl: RENDER_URL };
}
