/** Collect browser failures without relying on the scientific mismatch string. */
export function observeBrowserErrors(page, errors) {
  let active = true;
  const record = value => { if (active) errors.push(value); };
  page.on('pageerror', error => record('pageerror: ' + error.message));
  page.on('console', message => {
    if (message.type() === 'error') record('console: ' + message.text());
  });
  page.on('requestfailed', request => record('requestfailed: ' + request.url() + ': ' + request.failure()?.errorText));
  page.on('response', response => {
    if (response.status() >= 400) record('HTTP ' + response.status() + ': ' + response.url());
  });
  // Teardown aborts are not application errors; detach before closing a context.
  return () => { active = false; };
}
