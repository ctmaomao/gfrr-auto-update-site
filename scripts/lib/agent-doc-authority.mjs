// Validate delegation by destination, never by the displayed tool names.
export const AGENT_DOMAIN_DOC = 'docs/AGENT_DOMAIN_BOUNDARIES.md';

export function validateAgentDomainLinks(rootText, domainText) {
  const targets = [...rootText.matchAll(/\]\((docs\/AGENT_DOMAIN_BOUNDARIES\.md(?:#[^\s)]+)?)\)/g)]
    .map((match) => match[1]);
  const errors = [];
  if (targets.length === 0) errors.push(`AGENTS.md must link to ${AGENT_DOMAIN_DOC}`);
  if (typeof domainText !== 'string' || domainText.trim().length === 0) {
    errors.push(`${AGENT_DOMAIN_DOC} missing or empty`);
    return errors;
  }
  for (const target of new Set(targets)) {
    const anchor = target.split('#')[1];
    if (anchor && !domainText.includes(`<a id="${anchor}"></a>`)) {
      errors.push(`AGENTS.md points to missing domain anchor: ${target}`);
    }
  }
  return errors;
}
