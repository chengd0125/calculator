// Taiwan retail products are predominantly EAN-13. Keeping the decoder focused
// on common linear product codes reduces work per frame; TRY_HARDER also asks
// ZXing to inspect more scan lines and try a rotated image when needed.
export async function createCameraBarcodeScanner(video, onDecoded) {
  // Load the decoder only when a user opens the camera, keeping the normal app
  // startup bundle small for staff who use a hardware scanner or type instead.
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.UPC_EAN_EXTENSION,
    ]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 120,
    delayBetweenScanSuccess: 500,
    tryPlayVideoTimeout: 10000,
  });

  let controls = null;
  let paused = false;
  let starting = false;

  const scanner = {
    get isScanning() { return Boolean(controls); },
    async start() {
      if (controls || starting) return;
      starting = true;
      paused = false;
      try {
        controls = await reader.decodeFromConstraints({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }, video, (result) => {
          if (!result || paused) return;
          paused = true; // one decode at a time; prevents repeated API lookups
          Promise.resolve(onDecoded(result.getText(), scanner)).catch((error) => {
            console.error('Barcode handling failed:', error);
            scanner.resume();
          });
        });
        video.setAttribute('playsinline', 'true');
        video.muted = true;
      } finally {
        starting = false;
      }
    },
    pause() { paused = true; },
    resume() { if (controls) paused = false; },
    async stop() {
      paused = true;
      const activeControls = controls;
      controls = null;
      activeControls?.stop();
      video.pause();
      video.srcObject?.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    },
    getTrack() { return video.srcObject?.getVideoTracks?.()[0] || null; },
  };

  return scanner;
}

// Request continuous autofocus only when the active phone exposes the control.
// Avoid forced digital zoom: it can crop the barcode or make a close label blur.
export async function improveCameraCapture(scanner) {
  try {
    const track = scanner.getTrack?.();
    const focusModes = track?.getCapabilities?.().focusMode;
    if (focusModes?.includes?.('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch {
    // Autofocus constraints differ across browsers and camera hardware.
  }
}
