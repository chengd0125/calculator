import { useRef, useState } from 'react';

// 鍵盤模擬型掃描器（如 DUKEPOS XD-3003W）在中文輸入法（注音）開啟時，
// 送出的按鍵會被轉成注音/中文。這裡改用 e.code（實體按鍵）還原條碼，
// 並以「按鍵間隔極短」判斷是掃描器輸入，不影響手打中文商品名稱。

const MAX_INTERVAL_MS = 50; // 掃描器每鍵間隔通常 < 20ms，人手打字遠大於此
const MIN_LENGTH      = 4;

const SYMBOLS = { Minus:'-', Period:'.', Slash:'/', Space:' ', NumpadSubtract:'-', NumpadDecimal:'.', NumpadDivide:'/' };

function codeToChar(e) {
  const c = e.code || '';
  if (/^Digit\d$/.test(c))  return c.slice(5);
  if (/^Numpad\d$/.test(c)) return c.slice(6);
  if (/^Key[A-Z]$/.test(c)) return e.shiftKey ? c.slice(3) : c.slice(3).toLowerCase();
  return SYMBOLS[c] ?? null;
}

/**
 * 回傳 onKeyDown 用的處理函式：
 *   const scanned = detectScan(e);
 * 若這次按鍵是掃描器送出的 Enter，回傳還原後的條碼字串，否則回傳 null。
 * 偵測到掃描時會取消預設行為並結束輸入法組字，呼叫端應改用回傳值查詢，
 * 並在之後覆寫輸入框內容（輸入法可能會把已組字的中文寫回欄位）。
 */
export default function useBarcodeScanner() {
  const buf = useRef({ chars: '', last: 0 });

  return function detectScan(e) {
    const now = performance.now();
    const b = buf.current;
    const gap = now - b.last;
    b.last = now;

    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      const code = b.chars;
      const isScan = code.length >= MIN_LENGTH && gap < MAX_INTERVAL_MS * 4;
      b.chars = '';
      if (!isScan) return null;
      e.preventDefault();
      // 讓輸入法結束組字，避免中文殘留在候選窗
      const el = e.target;
      if (el && typeof el.blur === 'function') { el.blur(); el.focus(); }
      return code;
    }

    const ch = codeToChar(e);
    if (ch === null) return null; // Shift 等修飾鍵不計
    if (b.chars && gap > MAX_INTERVAL_MS) { b.chars = ''; }
    b.chars += ch;
    return null;
  };
}

// 掃描槍模式：手機（Android Gboard 注音）會把藍牙掃描器的按鍵組成中文，
// 而且瀏覽器拿不到實體按鍵資訊。改用 type="tel" 欄位，輸入法在電話欄位
// 不會組字，掃描器送出的英數會原樣進入欄位。關閉後才能打中文商品名稱。
const SCAN_MODE_KEY = 'scanMode';

export function useScanMode() {
  const [on, setOn] = useState(() => {
    try {
      const saved = localStorage.getItem(SCAN_MODE_KEY);
      if (saved !== null) return saved === '1';
    } catch {}
    return window.matchMedia?.('(pointer: coarse)').matches ?? false; // 手機預設開啟
  });
  function toggle() {
    setOn(v => {
      try { localStorage.setItem(SCAN_MODE_KEY, v ? '0' : '1'); } catch {}
      return !v;
    });
  }
  return [on, toggle];
}

// 掃描欄位共用屬性
export function scanInputProps(scanMode) {
  return scanMode
    ? { type: 'tel', autoComplete: 'off', autoCorrect: 'off', autoCapitalize: 'off', spellCheck: false }
    : { type: 'text' };
}
