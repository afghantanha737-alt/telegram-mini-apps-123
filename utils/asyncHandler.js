'use strict';

/**
 * در Express 4 اگر داخل یک handler ناهمگام (async) خطایی پرتاب شود و try/catch
 * نداشته باشیم، درخواست بی‌پاسخ می‌ماند. این تابع هر handler ثبت‌شده روی Router
 * را طوری می‌پیچد که خطا به «GLOBAL ERROR HANDLER» در server.js برسد و
 * کاربر پاسخ 500 بگیرد.
 */
function wrapRouter(router) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      original(
        path,
        ...handlers.map(handler =>
          typeof handler === 'function' && handler.length < 4
            ? (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)
            : handler
        )
      );
  }
  return router;
}

module.exports = { wrapRouter };
