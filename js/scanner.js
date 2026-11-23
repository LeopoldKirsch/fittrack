// Camera barcode scanner. Uses the native BarcodeDetector when available (Chrome/Android),
// otherwise a WebAssembly ponyfill (iPhone Safari).

import { openSheet, esc } from './ui.js';

const PONYFILL = 'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/dist/es/ponyfill.min.js';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

async function getDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      if (supported.includes('ean_13')) return new window.BarcodeDetector({ formats: FORMATS });
    } catch {}
  }
  const mod = await import(PONYFILL);
  return new mod.BarcodeDetector({ formats: FORMATS });
}

/** Opens a scanner sheet; resolves with the barcode string or null. */
export function scanBarcode() {
  return new Promise((resolve) => {
    let stream = null;
    let stopped = false;
    let result = null;
    const stop = () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    const sheet = openSheet({
      title: 'Scan barcode',
      tall: true,
      body: `
        <div class="scanner">
          <video playsinline muted autoplay></video>
          <div class="scan-frame"></div>
        </div>
        <p class="muted small center mt" id="scan-msg">Starting camera…</p>
        <div class="row gap mt">
          <input id="manual-code" inputmode="numeric" placeholder="…or type the barcode number" class="grow">
          <button class="btn" data-manual>OK</button>
        </div>`,
      mount(el) {
        const video = el.querySelector('video');
        const msg = el.querySelector('#scan-msg');
        el.onclick = (e) => {
          if (e.target.closest('[data-manual]')) {
            const v = el.querySelector('#manual-code').value.replace(/\D/g, '');
            if (v) finish(v);
          }
        };
        const finish = (code) => {
          result = code;
          stop();
          sheet.close();
        };
        (async () => {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
              audio: false,
            });
            if (stopped) return stop();
            video.srcObject = stream;
            await video.play().catch(() => {});
            msg.textContent = 'Loading scanner…';
            const detector = await getDetector();
            msg.textContent = 'Point the camera at the barcode';
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const tick = async () => {
              if (stopped) return;
              if (video.readyState >= 2 && video.videoWidth) {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0);
                try {
                  const codes = await detector.detect(canvas);
                  if (codes.length && codes[0].rawValue) {
                    navigator.vibrate?.(60);
                    return finish(codes[0].rawValue);
                  }
                } catch {}
              }
              setTimeout(tick, 250);
            };
            tick();
          } catch (e) {
            msg.innerHTML = `Camera unavailable (${esc(e.message || e.name)}). Type the number below instead.`;
          }
        })();
      },
      onClose() {
        stop();
        resolve(result);
      },
    });
  });
}
