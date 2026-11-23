export const MAX_AMOUNT = 999999999999;

const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const DAYS_LONG = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS_LONG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export function formatThousands(num) {
  const n = Math.max(0, Math.floor(Number(num) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRupiah(amount) {
  const n = Math.trunc(Number(amount) || 0);
  if (n < 0) {
    return `-Rp${formatThousands(Math.abs(n))}`;
  }
  return `Rp${formatThousands(n)}`;
}

export function formatRupiahSigned(amount) {
  const n = Math.trunc(Number(amount) || 0);
  if (n > 0) return `+Rp${formatThousands(n)}`;
  if (n < 0) return `-Rp${formatThousands(Math.abs(n))}`;
  return 'Rp0';
}

export function formatCompactIdr(value) {
  const abs = Math.abs(Number(value) || 0);
  const sign = value < 0 ? '-' : '';
  if (abs === 0) return '0';
  if (abs < 1000) return `${sign}${Math.round(abs)}`;
  if (abs < 1000000) {
    const v = abs / 1000;
    const str = v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${sign}${str} rb`;
  }
  if (abs < 1000000000) {
    const v = abs / 1000000;
    const str = v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${sign}${str} jt`;
  }
  const v = abs / 1000000000;
  const str = v >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, '').replace('.', ',');
  return `${sign}${str} M`;
}

export function toLocalISODate(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayISO() {
  return toLocalISODate(new Date());
}

export function getYesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalISODate(d);
}

export function isValidCalendarDate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const day = Number(dStr);
  if (y < 1970 || y > 2100 || m < 1 || m > 12 || day < 1 || day > 31) return false;
  const dt = new Date(y, m - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day;
}

export function parseLocalDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysISO(iso, deltaDays) {
  const dt = parseLocalDate(iso);
  dt.setDate(dt.getDate() + deltaDays);
  return toLocalISODate(dt);
}

export function getShortDayId(iso) {
  const dt = parseLocalDate(iso);
  return DAYS_SHORT[dt.getDay()];
}

export function formatDateShortId(iso) {
  if (!isValidCalendarDate(iso)) return iso;
  const dt = parseLocalDate(iso);
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`;
}

export function formatDateLongId(iso) {
  if (!isValidCalendarDate(iso)) return iso;
  const dt = parseLocalDate(iso);
  return `${DAYS_LONG[dt.getDay()]}, ${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]} ${dt.getFullYear()}`;
}

export function formatRelativeDayLabel(iso) {
  if (!isValidCalendarDate(iso)) return iso;
  const today = getTodayISO();
  const yesterday = getYesterdayISO();
  const dayShort = getShortDayId(iso);
  const dateShort = formatDateShortId(iso);
  if (iso === today) return `Hari ini (${dayShort}, ${dateShort})`;
  if (iso === yesterday) return `Kemarin (${dayShort}, ${dateShort})`;
  return formatDateLongId(iso);
}

export function formatMonthLabel(ym) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split('-').map(Number);
  if (m < 1 || m > 12) return ym;
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function formatDateTimeId(isoTimestamp) {
  if (!isoTimestamp) return 'Belum pernah backup';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return 'Belum pernah backup';
  const day = dt.getDate();
  const mon = MONTHS_SHORT[dt.getMonth()];
  const yr = dt.getFullYear();
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${day} ${mon} ${yr}, ${hh}:${mm}`;
}

export function getGreetingInfo(now = new Date()) {
  const h = now.getHours();
  if (h >= 4 && h < 11) {
    return { title: 'Selamat pagi!', subtitle: 'Mulai hari dengan menyisihkan tabungan kecil.' };
  }
  if (h >= 11 && h < 15) {
    return { title: 'Selamat siang!', subtitle: 'Tetap konsisten catat tabungan harianmu.' };
  }
  if (h >= 15 && h < 18) {
    return { title: 'Selamat sore!', subtitle: 'Sedikit demi sedikit lama-lama menjadi bukit.' };
  }
  return { title: 'Selamat malam!', subtitle: 'Sudah catat tabunganmu hari ini?' };
}

export function parseCurrencyDigits(str) {
  const clean = String(str || '').replace(/\D/g, '');
  if (!clean) return 0;
  const num = Number(clean);
  if (!Number.isFinite(num)) return 0;
  return Math.min(MAX_AMOUNT, Math.floor(num));
}

export function bindCurrencyInput(inputEl, onChange) {
  const applyValue = (rawDigits, targetDigitIndex) => {
    const trimmed = rawDigits.replace(/^0+(?=\d)/, '');
    let clamped = trimmed;
    if (clamped.length > 12) clamped = clamped.slice(0, 12);
    const num = clamped ? Math.min(MAX_AMOUNT, Number(clamped)) : 0;
    const formatted = num > 0 ? formatThousands(num) : '';
    inputEl.value = formatted;

    if (typeof targetDigitIndex === 'number') {
      let seenDigits = 0;
      let newPos = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (seenDigits >= targetDigitIndex) break;
        if (/\d/.test(formatted[i])) seenDigits++;
        newPos = i + 1;
      }
      if (targetDigitIndex === 0) newPos = 0;
      try {
        inputEl.setSelectionRange(newPos, newPos);
      } catch (_) {}
    }
    if (onChange) onChange(num);
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Backspace') return;
    const start = inputEl.selectionStart;
    const end = inputEl.selectionEnd;
    if (start == null || start !== end || start <= 0) return;
    const val = inputEl.value;
    if (val[start - 1] === '.') {
      e.preventDefault();
      // Remove the digit immediately before the dot
      const left = val.slice(0, Math.max(0, start - 2));
      const right = val.slice(start);
      const digitsBefore = left.replace(/\D/g, '').length;
      const combinedDigits = (left + right).replace(/\D/g, '');
      applyValue(combinedDigits, digitsBefore);
    }
  };

  const handleInput = () => {
    const pos = inputEl.selectionStart ?? inputEl.value.length;
    const digitsBefore = inputEl.value.slice(0, pos).replace(/\D/g, '').length;
    const digits = inputEl.value.replace(/\D/g, '');
    applyValue(digits, digitsBefore);
  };

  inputEl.addEventListener('keydown', handleKeyDown);
  inputEl.addEventListener('input', handleInput);

  return {
    setAmount(num) {
      const n = Math.min(MAX_AMOUNT, Math.max(0, Math.floor(Number(num) || 0)));
      inputEl.value = n > 0 ? formatThousands(n) : '';
      if (onChange) onChange(n);
    },
    getAmount() {
      return parseCurrencyDigits(inputEl.value);
    }
  };
}

export function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
