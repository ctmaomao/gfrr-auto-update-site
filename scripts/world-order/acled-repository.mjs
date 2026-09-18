// actions/checkout uses the suffix-free URL; local clones commonly use .git.
// These are two exact spellings of one fixed HTTPS repository, not URL parsing
// or normalization. Credentials, queries, redirects and other repositories fail.
export function isAcledRepositoryOrigin(value) {
  return value === 'https://github.com/ctmaomao/gfrr-auto-update-site'
    || value === 'https://github.com/ctmaomao/gfrr-auto-update-site.git';
}
