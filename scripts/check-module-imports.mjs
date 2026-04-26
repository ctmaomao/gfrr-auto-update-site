const MODULES = [
  './modules/format.js',
  './modules/config.js',
  './modules/displayTextBuilders.js',
  './modules/renderTables.js',
  './modules/renderCharts.js',
  './modules/renderAudit.js',
  './modules/render.js',
  './modules/realtime.js',
  './modules/decision.js'
];

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
