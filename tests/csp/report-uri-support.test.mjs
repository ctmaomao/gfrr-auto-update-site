// Manual-only regression for ADR-0061. Never serves a page or sends a report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  POLICY_DIRECTIVE_ORDER, REPORT_URI_ENDPOINT, REPORT_ONLY_HEADER,
  validateCspConfig, serializePolicy, buildEdgeoneJson, deriveExpectedHashSources,
} from '../../scripts/lib/edgeone-csp-policy.mjs';
import { buildStagingDirectory, checkStagingDirectory } from '../../scripts/build-edgeone-release-artifact.mjs';

const root = resolve(import.meta.dirname, '../..');
const configPath = resolve(root, 'config/edgeone/csp-report-only.json');
const originalConfigBytes = readFileSync(configPath);
const freshConfig = () => JSON.parse(originalConfigBytes);
const reportingConfig = () => {
  const config = freshConfig();
  config.directives['report-uri'] = REPORT_URI_ENDPOINT;
  return config;
};
const pages = deriveExpectedHashSources(root).pages;
const hashes = {
  scriptHashes: pages.flatMap((page) => page.scriptHashes),
  styleHashes: pages.flatMap((page) => page.styleHashes),
};
// Independent legacy serializer: locks exact pre-change order and text, including real page hashes.
const legacyPolicy = POLICY_DIRECTIVE_ORDER.map((name) => `${name} ${freshConfig().directives[name]
  .replaceAll('{{scriptHashes}}', hashes.scriptHashes.join(' '))
  .replaceAll('{{styleHashes}}', hashes.styleHashes.join(' ')).trim()}`).join('; ');

test('production configuration stays without reporting and emits exactly the legacy document', () => {
  const config = freshConfig();
  assert.equal(Object.hasOwn(config.directives, 'report-uri'), false);
  assert.equal(serializePolicy(config, hashes), legacyPolicy);
  assert.deepEqual(buildEdgeoneJson({ config, pages }).json, {
    headers: [{ source: config.source, headers: [{ key: REPORT_ONLY_HEADER, value: legacyPolicy }] }],
  });
  assert.deepEqual(readFileSync(configPath), originalConfigBytes);
});

test('approved endpoint appends once and changes no existing directive or header name', () => {
  const config = reportingConfig();
  assert.equal(validateCspConfig(config), config);
  const result = buildEdgeoneJson({ config, pages });
  assert.equal(result.policy, `${legacyPolicy}; report-uri ${REPORT_URI_ENDPOINT}`);
  assert.equal(result.policy.split('report-uri ').length - 1, 1);
  assert.equal(result.json.headers[0].headers[0].key, REPORT_ONLY_HEADER);
  assert.ok(!result.policy.includes('report-to'));
  assert.ok(!JSON.stringify(result.json).includes('Reporting-Endpoints'));
});

const rejected = [
  undefined, null, false, 1, [], {}, '', ' ',
  ` ${REPORT_URI_ENDPOINT}`, `${REPORT_URI_ENDPOINT} `,
  `${REPORT_URI_ENDPOINT}\n`, `${REPORT_URI_ENDPOINT}\r\nX-Test: injected`,
  `${REPORT_URI_ENDPOINT}; report-to other`, `${REPORT_URI_ENDPOINT} ${REPORT_URI_ENDPOINT}`,
  REPORT_URI_ENDPOINT.replace('https:', 'http:'),
  REPORT_URI_ENDPOINT.replace('https://', 'https://user:pass@'),
  `${REPORT_URI_ENDPOINT}?token=synthetic`, `${REPORT_URI_ENDPOINT}#fragment`,
  `${REPORT_URI_ENDPOINT}/`, 'https://unapproved.example/csp-report',
  REPORT_URI_ENDPOINT.replace('/csp-report', '/health'),
  REPORT_URI_ENDPOINT.replace('https:', 'HTTPS:'),
  REPORT_URI_ENDPOINT.replace('csp-report', '%63sp-report'),
];
rejected.forEach((value, index) => {
  test(`invalid endpoint variant ${index + 1} fails in enabled and disabled configurations`, () => {
    for (const enabled of [true, false]) {
      const config = freshConfig();
      config.enabled = enabled;
      config.directives['report-uri'] = value;
      assert.throws(() => validateCspConfig(config), /exact approved single HTTPS endpoint/);
      assert.throws(() => buildEdgeoneJson({ config, pages }), /exact approved single HTTPS endpoint/);
    }
  });
});

test('optional reporting does not bypass required directives, unknown directives or hash guards', () => {
  for (const name of POLICY_DIRECTIVE_ORDER) {
    const config = reportingConfig();
    delete config.directives[name];
    assert.throws(() => validateCspConfig(config), /missing directive/);
  }
  for (const name of ['report-to', 'Reporting-Endpoints', 'REPORT-URI', 'unrecognised']) {
    const config = reportingConfig();
    config.directives[name] = 'unapproved';
    assert.throws(() => validateCspConfig(config), /unknown directive/);
  }
  const literal = reportingConfig();
  literal.directives['script-src'] = "'self' 'sha256-YWJj' {{scriptHashes}}";
  assert.throws(() => validateCspConfig(literal), /literal hash/);
  const misplaced = reportingConfig();
  misplaced.directives['script-src'] = "'self' {{styleHashes}}";
  misplaced.directives['style-src-elem'] = "'self' {{scriptHashes}}";
  assert.throws(() => validateCspConfig(misplaced), /must be placed in script-src/);
  const duplicate = reportingConfig();
  duplicate.directives['script-src'] += ' {{scriptHashes}}';
  assert.throws(() => validateCspConfig(duplicate), /exactly once/);
  assert.throws(() => buildEdgeoneJson({ config: reportingConfig(), pages: [] }), /no pages/);
  assert.throws(() => buildEdgeoneJson({ config: reportingConfig(), pages: [{ scriptHashes: [], styleHashes: [] }] }), /empty/);
  const oversized = reportingConfig();
  oversized.directives['img-src'] += ` ${'x'.repeat(1000)}`;
  assert.throws(() => buildEdgeoneJson({ config: oversized, pages }), /over the 1000 limit/);
});

test('disabled reporting configuration still emits an explicit empty headers document', () => {
  const config = reportingConfig();
  config.enabled = false;
  assert.deepEqual(buildEdgeoneJson({ config, pages }), {
    json: { headers: [] }, state: 'disabled', policy: null,
  });
});

test('staging builds with the candidate, rejects endpoint tampering, and removal restores legacy text', (t) => {
  // All writes are in a newly created temporary tree owned by this test; no production config edits.
  const temp = mkdtempSync(resolve(tmpdir(), 'gfrr-report-uri-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const artifactDir = resolve(temp, 'artifact');
  mkdirSync(artifactDir);
  writeFileSync(resolve(artifactDir, 'bubble-watch.html'), readFileSync(resolve(root, 'bubble-watch.html')));
  writeFileSync(resolve(artifactDir, 'index.html'), '<!doctype html><title>local fixture</title>');
  const candidatePath = resolve(temp, 'candidate.json');
  writeFileSync(candidatePath, JSON.stringify(reportingConfig()));
  const stagingDir = resolve(temp, 'candidate-staging');
  const built = buildStagingDirectory({ outDir: stagingDir, artifactDir, configPath: candidatePath });
  assert.deepEqual(built.tree.files, ['bubble-watch.html', 'index.html']);
  assert.equal(built.policy, `${legacyPolicy}; report-uri ${REPORT_URI_ENDPOINT}`);
  assert.equal(checkStagingDirectory({ stagingDir, artifactDir, configPath: candidatePath }).ok, true);
  const documentPath = resolve(stagingDir, 'edgeone.json');
  const document = JSON.parse(readFileSync(documentPath));
  document.headers[0].headers[0].value = document.headers[0].headers[0].value.replace(REPORT_URI_ENDPOINT, 'https://unapproved.example/csp-report');
  writeFileSync(documentPath, JSON.stringify(document));
  assert.equal(checkStagingDirectory({ stagingDir, artifactDir, configPath: candidatePath }).ok, false);
  writeFileSync(candidatePath, JSON.stringify(freshConfig()));
  const rollbackDir = resolve(temp, 'rollback-staging');
  const rollback = buildStagingDirectory({ outDir: rollbackDir, artifactDir, configPath: candidatePath });
  assert.equal(rollback.policy, legacyPolicy);
  assert.equal(checkStagingDirectory({ stagingDir: rollbackDir, artifactDir, configPath: candidatePath }).ok, true);
  assert.deepEqual(readFileSync(configPath), originalConfigBytes);
});
