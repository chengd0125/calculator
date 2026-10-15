// Configuration shared by the order and return camera scanners.
// The viewfinder is sized from the actual mobile preview so it also works
// when the camera feed is narrower than a desktop screen.
export function createBarcodeScannerConfig() {
  const formats = window.Html5QrcodeSupportedFormats;

  return {
    fps: 20,
    // Leave qrbox unset so the decoder examines the full camera preview;
    // this avoids missing a barcode when the phone or label is turned.
    ...(formats ? {
      formatsToSupport: [
        formats.EAN_13,
        formats.CODABAR,
        formats.CODE_39,
        formats.CODE_93,
        formats.CODE_128,
        formats.EAN_8,
        formats.ITF,
        formats.UPC_A,
        formats.UPC_E,
        formats.UPC_EAN_EXTENSION,
      ].filter(format => format !== undefined),
    } : {}),
  };
}

// Ask the active phone camera for more detail and continuous focus when the
// browser exposes those controls. Older browsers simply keep their defaults.
export async function improveCameraCapture(scanner) {
  try {
    const capabilities = scanner.getRunningTrackCapabilities?.();
    const constraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    };

    if (capabilities?.focusMode?.includes?.('continuous')) {
      constraints.advanced = [{ focusMode: 'continuous' }];
    }

    await scanner.applyVideoConstraints?.(constraints);
  } catch {
    // Higher resolution or continuous focus is optional and device-dependent.
  }

  try {
    const zoom = scanner.getRunningTrackCameraCapabilities?.().zoomFeature();
    if (!zoom?.isSupported()) return;

    const targetZoom = Math.min(zoom.max(), Math.max(zoom.min(), 2));
    if (targetZoom > (zoom.value() || 1)) await zoom.apply(targetZoom);
  } catch {
    // Keep scanning at the camera's default zoom when zoom cannot be applied.
  }
}
