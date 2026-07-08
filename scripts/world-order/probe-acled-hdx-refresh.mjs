#!/usr/bin/env node
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const HDX_ACLED_PACKAGE_IDS = [
  'political-violence-events-and-fatalities',
  'civilian-targeting-events-and-fatalities',
  'demonstration-events'
];

const HDX_API_BASE = 'https://data.humdata.org/api/3/action/package_show';
const MONTHS = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12'
};

function isoMin(values) {
  const dates = values.filter(Boolean).sort();
  return dates[0] || null;
}

function isoMax(values) {
  const dates = values.filter(Boolean).sort();
  return dates.at(-1) || null;
}

export function parseDatasetDateEnd(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/\bTO\s+(\d{4}-\d{2}-\d{2})T/u);
  return match?.[1] || null;
}

export function parseAsOfDate(value) {
  if (typeof value !== 'string') return null;
  const iso = value.match(/as-of-(\d{4}-\d{2}-\d{2})/iu);
  if (iso) return iso[1];
  const compact = value.match(/as-of-(\d{2})(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{4})/iu);
  if (!compact) return null;
  return `${compact[3]}-${MONTHS[compact[2].toLowerCase()]}-${compact[1]}`;
}

export function normalizeHdxPackage(input) {
  const pkg = input?.result || input;
  const resource = Array.isArray(pkg?.resources) ? pkg.resources[0] : null;
  const resourceName = resource?.name || '';
  const resourceUrl = resource?.url || '';
  return {
    id: pkg?.name || null,
    title: pkg?.title || null,
    licenseId: pkg?.license_id || null,
    licenseTitle: pkg?.license_title || null,
    datasetDate: pkg?.dataset_date || null,
    datasetEndDate: parseDatasetDateEnd(pkg?.dataset_date),
    metadataModified: pkg?.metadata_modified || null,
    updateFrequencyDays: Number.isFinite(Number(pkg?.data_update_frequency))
      ? Number(pkg.data_update_frequency)
      : null,
    resourceName: resourceName || null,
    resourceFormat: resource?.format || null,
    resourceSize: Number.isFinite(Number(resource?.size)) ? Number(resource.size) : null,
    resourceLastModified: resource?.last_modified || null,
    resourceUrl: resourceUrl || null,
    asOfDate: parseAsOfDate(`${resourceName} ${resourceUrl}`)
  };
}

export function summarizeHdxPackages(packages, expectedIds = HDX_ACLED_PACKAGE_IDS) {
  const entries = packages.map(normalizeHdxPackage);
  const ids = new Set(entries.map((entry) => entry.id).filter(Boolean));
  const missingPackages = expectedIds.filter((id) => !ids.has(id));
  const blockers = [];
  const warnings = [];
  const asOfDates = entries.map((entry) => entry.asOfDate).filter(Boolean);
  const datasetEndDates = entries.map((entry) => entry.datasetEndDate).filter(Boolean);
  const uniqueAsOfDates = [...new Set(asOfDates)].sort();

  if (missingPackages.length) blockers.push(`missing_packages:${missingPackages.join(',')}`);
  if (entries.some((entry) => entry.resourceFormat !== 'XLSX')) blockers.push('non_xlsx_resource');
  if (entries.some((entry) => !entry.asOfDate)) blockers.push('missing_resource_as_of_date');
  if (entries.some((entry) => !entry.datasetEndDate)) blockers.push('missing_dataset_end_date');
  if (uniqueAsOfDates.length > 1) blockers.push(`inconsistent_as_of_dates:${uniqueAsOfDates.join(',')}`);
  if (entries.some((entry) => entry.licenseTitle !== 'Other')) warnings.push('unexpected_license_title');
  if (entries.some((entry) => entry.updateFrequencyDays !== 7)) warnings.push('unexpected_update_frequency');

  const asOfDate = uniqueAsOfDates.length === 1 ? uniqueAsOfDates[0] : isoMin(asOfDates);
  const readyForManualReminder = blockers.length === 0;

  return {
    schemaVersion: 'acled-hdx-refresh-probe-v1',
    provider: 'HDX CKAN',
    packageIds: expectedIds,
    status: readyForManualReminder ? 'hdx_acled_asof_ready' : 'hdx_acled_asof_not_ready',
    readyForManualReminder,
    asOfDate,
    datasetEndDate: isoMin(datasetEndDates),
    latestMetadataModified: isoMax(entries.map((entry) => entry.metadataModified)),
    latestResourceModified: isoMax(entries.map((entry) => entry.resourceLastModified)),
    reminderKey: readyForManualReminder ? `acled-hdx-asof-${asOfDate}` : null,
    entries,
    blockers,
    warnings
  };
}

async function fetchHdxPackage(id, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${HDX_API_BASE}?id=${encodeURIComponent(id)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GFRRBot/1.0 acled-hdx-refresh-probe' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HDX package_show ${id} failed: ${response.status}`);
    const payload = await response.json();
    if (payload?.success !== true || !payload.result) throw new Error(`HDX package_show ${id} returned no result`);
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

function parseArgs(argv) {
  const args = { fixture: null, json: false, requireReady: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--fixture') {
      args.fixture = argv[i + 1];
      i += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--require-ready') {
      args.requireReady = true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const packages = args.fixture
    ? JSON.parse(fs.readFileSync(args.fixture, 'utf8'))
    : await Promise.all(HDX_ACLED_PACKAGE_IDS.map((id) => fetchHdxPackage(id)));
  const summary = summarizeHdxPackages(packages);

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`ACLED HDX refresh probe: ${summary.status}`);
    console.log(`asOfDate=${summary.asOfDate || 'null'} reminderKey=${summary.reminderKey || 'null'}`);
    if (summary.blockers.length) console.log(`blockers=${summary.blockers.join(',')}`);
    if (summary.warnings.length) console.log(`warnings=${summary.warnings.join(',')}`);
  }

  if (args.requireReady && !summary.readyForManualReminder) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
