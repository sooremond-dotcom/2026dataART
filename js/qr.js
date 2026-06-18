/*
 * qr.js — QR 코드를 캔버스에 그리는 얇은 헬퍼 (vendor/qrcode.min.js 사용)
 * QR.draw(canvas, text, {size, margin, dark, light, ecc})
 */
(function (global) {
  'use strict';
  function draw(canvas, text, opts) {
    opts = opts || {};
    if (!global.qrcode) { return canvas; }
    const qr = global.qrcode(0, opts.ecc || 'M');
    qr.addData(text || ' ');
    qr.make();
    const count = qr.getModuleCount();
    const margin = opts.margin != null ? opts.margin : 2;
    const total = count + margin * 2;
    const target = opts.size || 220;
    const cell = Math.max(1, Math.floor(target / total));
    const dim = cell * total;
    canvas.width = dim; canvas.height = dim;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff'; ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = opts.dark || '#0a0c12';
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    return canvas;
  }
  global.QR = { draw };
})(window);
