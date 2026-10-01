// Test-only probe for the evidence-completeness negative control.
//
// Loaded through `NODE_OPTIONS=--require` so it runs inside the runner process before the runner
// reads the digest ledger. It removes one mode's digest from the ledger only when the named key
// is present, so the completeness check can be observed failing on real, otherwise-valid
// evidence rather than on a hand written fixture.
const { readFileSync, writeFileSync } = require('node:fs');

const target = process.env.PROBE_DELETE_KEY;
const ledgerPath = process.env.PROBE_LEDGER_PATH;
if (!target || !ledgerPath) return;

try {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  const [key, mode] = target.split('|');
  if (ledger[key] && (mode === 'none' || ledger[key][mode] !== undefined)) {
    if (mode !== 'none') {
      delete ledger[key][mode];
      writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
      console.log(`[probe] removed ${key}.${mode} from ${ledgerPath}`);
    } else {
      console.log(`[probe] delete-probe installed; ${key} present, nothing removed`);
    }
  } else {
    console.log(`[probe] target ${target} not found in ledger`);
  }
} catch (error) {
  console.log(`[probe] ledger unreadable: ${error.message}`);
}
