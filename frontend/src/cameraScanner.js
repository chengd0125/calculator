// Configuration shared by the order and return camera scanners.
// The viewfinder is sized from the actual mobile preview so it also works
// when the camera feed is narrower than a desktop screen.
export function createBarcodeScannerConfig() {
  const formats = window.Html5QrcodeSupportedFormats;

  return {
    fps: 20,
    qrbox: (viewfinderWidth, viewfinderHeight) => ({
      width: Math.min(viewfinderWidth, Math.max(220, Math.floor(Math.min(viewfinderWidth * 0.92, 720)))),
      height: Math.min(viewfinderHeight, Math.max(100, Math.floor(Math.min(viewfinderHeight * 0.32, 240)))),
    }),
    ...(formats ? {
      formatsToSupport: [
        formats.CODABAR,
        formats.CODE_39,
        formats.CODE_93,
        formats.CODE_128,
        formats.EAN_8,
        formats.EAN_13,
        formats.ITF,
        formats.UPC_A,
        formats.UPC_E,
        formats.UPC_EAN_EXTENSION,
      ].filter(format => format !== undefined),
    } : {}),
  };
}
