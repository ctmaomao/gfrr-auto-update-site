const HTTP_ERROR_CATEGORIES = Object.freeze({
  401: 'http_401_unauthorized',
  402: 'http_402_payment_required',
  403: 'http_403_forbidden',
  429: 'http_429_rate_limited',
  432: 'http_432_plan_limit',
  433: 'http_433_paygo_limit'
});

export function classifySearchRequestError(error) {
  if (error?.name === 'AbortError') return 'request_timeout';

  const status = Number.isInteger(error?.httpStatus)
    ? error.httpStatus
    : Number(String(error?.message || '').match(/HTTP\s+(\d{3})/u)?.[1]);

  if (HTTP_ERROR_CATEGORIES[status]) return HTTP_ERROR_CATEGORIES[status];
  if (status >= 500 && status <= 599) return 'http_5xx_server_error';
  if (status >= 400 && status <= 499) return 'http_4xx_client_error';
  if (error instanceof SyntaxError) return 'invalid_json';
  if (error instanceof TypeError) return 'network_error';
  return 'request_failed';
}
