import fs from 'node:fs';
import path from 'node:path';
import { AGENT_DOMAIN_DOC, validateAgentDomainLinks } from './lib/agent-doc-authority.mjs';

const ROOT = process.cwd();
const README = 'README.md';
const AGENTS = 'AGENTS.md';
const DOCS_DIR = 'docs';
const failures = [];
const formatFailures = [];

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function addFailure(source, link, resolvedTarget) {
  failures.push({ source, link, resolvedTarget });
  console.error(
    `Documentation link check failed: ${source} links to missing file ${link} (${resolvedTarget})`
  );
}

function getMarkdownFiles() {
  const readmePath = path.join(ROOT, README);
  const agentsPath = path.join(ROOT, AGENTS);
  const docsPath = path.join(ROOT, DOCS_DIR);

  if (!fs.existsSync(readmePath)) {
    addFailure(README, README, README);
    return [];
  }

  if (!fs.existsSync(agentsPath)) {
    addFailure(AGENTS, AGENTS, AGENTS);
    return [README];
  }

  if (!fs.existsSync(docsPath) || !fs.statSync(docsPath).isDirectory()) {
    addFailure(README, DOCS_DIR, DOCS_DIR);
    return [README, AGENTS];
  }

  const docs = fs.readdirSync(docsPath)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => toPosix(path.join(DOCS_DIR, entry)));

  return [README, AGENTS, ...docs];
}

function shouldIgnoreLink(href) {
  return (
    href === '' ||
    href.startsWith('#') ||
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('mailto:')
  );
}

function normalizeHref(rawHref) {
  const trimmed = rawHref.trim();
  const unwrapped = trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed.slice(1, -1)
    : trimmed;
  return unwrapped.split('#')[0];
}

function getInlineMarkdownLinks(markdown) {
  const links = [];
  const pattern = /(?<!!)\[[^\]\n]+\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

  for (const match of markdown.matchAll(pattern)) {
    links.push(match[1]);
  }

  return links;
}

function checkFile(source) {
  const sourcePath = path.join(ROOT, source);
  const markdown = fs.readFileSync(sourcePath, 'utf8');
  const sourceDir = path.dirname(source);

  for (const rawHref of getInlineMarkdownLinks(markdown)) {
    if (shouldIgnoreLink(rawHref)) continue;

    const targetWithoutAnchor = normalizeHref(rawHref);
    if (shouldIgnoreLink(targetWithoutAnchor)) continue;

    const resolvedTarget = path.normalize(path.join(ROOT, sourceDir, targetWithoutAnchor));
    if (!fs.existsSync(resolvedTarget) || !fs.statSync(resolvedTarget).isFile()) {
      addFailure(source, rawHref, toPosix(path.relative(ROOT, resolvedTarget)));
    }
  }
}

// M-DOC-1: merged from former check:project-backlog-format — required backlog
// sections present + non-stub content. PROJECT_BACKLOG.md is governance authority.
function checkProjectBacklogFormat() {
  const backlogPath = path.join(ROOT, 'docs/PROJECT_BACKLOG.md');
  if (!fs.existsSync(backlogPath)) {
    formatFailures.push('M-57: docs/PROJECT_BACKLOG.md does not exist');
    return;
  }
  const content = fs.readFileSync(backlogPath, 'utf8');
  const expectedSections = [
    '## Section 1',
    '## Section 2',
    '## Section 3',
    '## Section 4',
    '## Section 5',
    '## Section 6',
  ];
  for (const section of expectedSections) {
    if (!content.includes(section)) {
      formatFailures.push(`M-57 project-backlog: missing section header "${section}"`);
    }
  }
  for (let i = 0; i < expectedSections.length; i += 1) {
    const startMarker = expectedSections[i];
    const endMarker = i < expectedSections.length - 1 ? expectedSections[i + 1] : null;
    const startIdx = content.indexOf(startMarker);
    const endIdx = endMarker ? content.indexOf(endMarker) : content.length;
    if (startIdx === -1) continue;
    const sectionContent = content.substring(startIdx + startMarker.length, endIdx);
    if (sectionContent.trim().length < 50) {
      formatFailures.push(`M-57 project-backlog: section "${startMarker}" appears empty or too short`);
    }
  }
  if (content.trim().length < 500) {
    formatFailures.push('M-57 project-backlog: file is too short, may be a stub');
  }
}

const markdownFiles = getMarkdownFiles();

for (const file of markdownFiles) {
  const absolutePath = path.join(ROOT, file);
  if (!fs.existsSync(absolutePath)) {
    addFailure(file, file, file);
    continue;
  }
  checkFile(file);
}

checkProjectBacklogFormat();
const readOptional = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
formatFailures.push(...validateAgentDomainLinks(readOptional(AGENTS), readOptional(AGENT_DOMAIN_DOC)));
for (const message of formatFailures) {
  console.error(`Project backlog format check failed: ${message}`);
}

if (failures.length > 0 || formatFailures.length > 0) {
  if (failures.length > 0) {
    console.error(`Documentation link check failed: ${failures.length} issue(s) found`);
  }
  process.exit(1);
}

console.log('Documentation link + project-backlog format check passed');
