/* Stable weekly landing; existing radar hashes keep their original document and IDs. */
(() => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.hash && url.searchParams.get('view') !== 'radar') {
    window.location.replace(new URL('weekly-reports.html', url).href);
  }
})();
