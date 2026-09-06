import path from 'node:path';

// No ignore list: unknown file types, rule changes and executable examples use full checks.
// These are routing heuristics, not proof of prose semantics; reviewers may require more.
export function chooseChecks(changes, consumers = '') {
  if (!changes.length) return { mode: 'none', reason: 'No working-tree changes' };
  for (const { file, delta, deleted } of changes) {
    if (!/\.md$/i.test(file)) return { mode: 'full', reason: `Non-Markdown change: ${file}` };
    if (deleted || /(^|\/)(AGENTS|CLAUDE|DESIGN|SKILL)\.md$|^docs\/ADR\/|CONTRACT|BOUNDAR|POLICY|OPERATIONS|DATA_SOURCES|PROJECT_BACKLOG/i.test(file)) {
      return { mode: 'full', reason: `Governance or deletion: ${file}` };
    }
    if (consumers.includes(file) || consumers.includes(path.posix.basename(file))) {
      return { mode: 'full', reason: `Consumed by code/checkers: ${file}` };
    }
    if (/`|~~~|<\/?(?:script|style)|\b(?:must|shall|required|approval|authorize\w*|permission|npm|node|python|git|curl)\b|必须|禁止|授权|批准|权限|审批|不得|检查要求/i.test(delta)) {
      return { mode: 'full', reason: `Executable or normative text: ${file}` };
    }
  }
  return { mode: 'light', reason: 'Ordinary Markdown only; no detected contract/code/permission change' };
}

export function stripCode(text) {
  return stripFences(text).replace(/`+[^`\n]*`+/g, '');
}

const stripFences = (text) => text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[^\n]*(?:\n|$)/gm, '');

export function anchors(text) {
  const found = new Set();
  const clean = stripFences(text).replace(/`+/g, '');
  for (const m of clean.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) found.add(m[1]);
  const used = new Set();
  for (const m of clean.matchAll(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$|^([^\n]+)\n(?:={3,}|-{3,})\s*$/gm)) {
    const raw = (m[1] || m[2]).replace(/<[^>]*>/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    let slug = raw, n = 0;
    while (used.has(slug)) slug = `${raw}-${++n}`;
    used.add(slug); found.add(slug);
  }
  return found;
}

export function links(text) {
  const clean = stripCode(text), refs = new Map(), result = [];
  for (const m of clean.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)) refs.set(m[1].toLowerCase(), m[2]);
  for (const m of clean.matchAll(/!?\[([^\]\n]*)\]\((<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)|!?\[([^\]\n]+)\]\[([^\]\n]*)\]|!?\[([^\]\n]+)\](?![(:\[])/g)) {
    const href = m[2] || refs.get((m[4] || m[3] || m[5]).toLowerCase());
    if (href) result.push(href.replace(/^<|>$/g, ''));
    else if (m[3]) result.push(`unresolved-reference:${m[4] || m[3]}`);
  }
  return result;
}

// Scan every supplied Markdown source, including inbound links to renamed/changed targets.
// No ignored link defects: clean committed checkouts are checked as strictly as local edits.
export function linkIssues(documents, exists) {
  const issues = new Set(), anchorCache = new Map();
  for (const [file, text] of documents) {
    for (const href of links(text)) {
      if (href.startsWith('unresolved-reference:')) { issues.add(`${file}: ${href}`); continue; }
      if (/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) continue;
      let decoded;
      try { decoded = decodeURIComponent(href); } catch { issues.add(`${file}: invalid URL ${href}`); continue; }
      const [destination, fragment] = decoded.split('#');
      const target = destination ? path.posix.normalize(path.posix.join(path.posix.dirname(file), destination.split('?')[0])) : file;
      if (target.startsWith('../') || target.startsWith('/') || !exists(target)) {
        issues.add(`${file}: missing target ${href}`); continue;
      }
      if (fragment && documents.has(target)) {
        if (!anchorCache.has(target)) anchorCache.set(target, anchors(documents.get(target)));
        if (!anchorCache.get(target).has(fragment)) issues.add(`${file}: missing anchor ${href}`);
      }
    }
  }
  return issues;
}
