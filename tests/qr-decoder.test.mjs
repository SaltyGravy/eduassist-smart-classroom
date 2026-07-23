import assert from "node:assert/strict";
import test from "node:test";
import jsQR from "jsqr";
import QRCode from "qrcode";

function qrPixels(payload, scale = 7, margin = 4) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const modules = qr.modules;
  const width = (modules.size + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(width * width * 4);
  pixels.fill(255);

  for (let moduleY = 0; moduleY < modules.size; moduleY += 1) {
    for (let moduleX = 0; moduleX < modules.size; moduleX += 1) {
      if (!modules.get(moduleX, moduleY)) continue;
      const startX = (moduleX + margin) * scale;
      const startY = (moduleY + margin) * scale;
      for (let pixelY = startY; pixelY < startY + scale; pixelY += 1) {
        for (let pixelX = startX; pixelX < startX + scale; pixelX += 1) {
          const offset = (pixelY * width + pixelX) * 4;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
          pixels[offset + 3] = 255;
        }
      }
    }
  }
  return { pixels, width };
}

test("software scanner decodes an EduAssist attendance QR payload", () => {
  const payload = JSON.stringify({
    type: "eduassist-attendance",
    version: 3,
    sessionId: 42,
    rotation: 178472520,
    rotationSeconds: 10,
    token: "68F6A962C356CC225B7F623077FD18189387A58E",
    expiresAt: "2026-07-22T14:20:10.000Z",
  });
  const { pixels, width } = qrPixels(payload);
  const decoded = jsQR(pixels, width, width, { inversionAttempts: "attemptBoth" });
  assert.equal(decoded?.data, payload);
});
