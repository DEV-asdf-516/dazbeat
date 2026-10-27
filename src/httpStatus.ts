export const HTTP_STATUS = {
  ok: 200,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  gone: 410,
  payloadTooLarge: 413,
  unprocessableContent: 422,
  tooManyRequests: 429,
  internalServerError: 500,
} as const;
