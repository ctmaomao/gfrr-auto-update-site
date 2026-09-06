// Child-process fault injection: never edits the actual authority documents.
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const originalRead = fs.readFileSync;
const domain = path.resolve('docs/AGENT_DOMAIN_BOUNDARIES.md');
const root = path.resolve('AGENTS.md');
const realDomain = originalRead(domain, 'utf8');
fs.readFileSync = function (file, ...args) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  // A full legacy tool list in the root must not rescue the missing domain rule.
  if (resolved === root) return realDomain;
  if (resolved === domain) {
    if (process.env.AGENT_DOC_TEST_MODE === 'missing') {
      const error = new Error(`ENOENT: ${domain}`);
      error.code = 'ENOENT';
      throw error;
    }
    const marker = process.env.AGENT_DOC_TEST_MARKER;
    if (!marker || !realDomain.includes(marker)) throw new Error('Invalid test marker');
    return realDomain.replaceAll(marker, 'REMOVED_BY_TEST');
  }
  return originalRead.call(this, file, ...args);
};
syncBuiltinESMExports();
