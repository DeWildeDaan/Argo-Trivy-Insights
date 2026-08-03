export function getUrlParam(key: string): string | null {
  return new URLSearchParams(window.location.search).get(key);
}

export function setUrlParam(key: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null || value === '') {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, value);
  }
  window.history.replaceState(null, '', url.toString());
}
