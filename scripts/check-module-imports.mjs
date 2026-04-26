import fs from 'node:fs';

const MODULE_DIR = 'modules';

const MODULES = fs.readdirSync(new URL(`./${MODULE_DIR}/`, import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => `./${MODULE_DIR}/${entry.name}`)
  .sort((a, b) => a.localeCompare(b));

const failures = [];

for (const modulePath of MODULES) {
  try {
    await import(new URL(modulePath, import.meta.url));
    console.log(`OK ${modulePath}`);
  } catch (error) {
    failures.push({ modulePath, error });
    console.error(`FAIL ${modulePath}`);
    console.error(error?.stack || error);
  }
}

if (failures.length > 0) {
  console.error(`Module import check failed: ${failures.length} module(s) failed`);
  process.exit(1);
}

console.log('Module import check passed');
