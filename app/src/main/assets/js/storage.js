import { MAX_AMOUNT, getTodayISO, isValidCalendarDate } from './format.js';

export const STORAGE_KEY = 'tabungansaya_v1';

export function createDefaultState() {
  return {
    version: 1,
    transactions: [],
    goal: null,
    theme: null,
    lastBackupAt: null,
    changesSinceBackup: 0,
    reminder: {
      enabled: false,
      time: '20:00',
      lastNotifiedDate: null
    },
    welcomeCollapsed: false
  };
}

function sanitizeNote(note, maxLen = 120) {
  if (typeof note !== 'string') return '';
  return note.trim().slice(0, maxLen);
}

function sanitizeGoalName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, 60);
}

function sanitizeTime(time) {
  if (typeof time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return time;
  }
  return '20:00';
}

function normalizeTransaction(tx) {
  if (!tx || typeof tx !== 'object') return null;
  const type = tx.type === 'withdraw' ? 'withdraw' : tx.type === 'deposit' ? 'deposit' : null;
  if (!type) return null;

  const amount = Number(tx.amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;

  if (!isValidCalendarDate(tx.date)) return null;

  const id = typeof tx.id === 'string' && tx.id.trim() ? tx.id.trim().slice(0, 64) : generateId();
  const nowIso = new Date().toISOString();
  const createdAt = typeof tx.createdAt === 'string' && !Number.isNaN(Date.parse(tx.createdAt)) ? tx.createdAt : nowIso;
  const updatedAt = typeof tx.updatedAt === 'string' && !Number.isNaN(Date.parse(tx.updatedAt)) ? tx.updatedAt : createdAt;

  return {
    id,
    type,
    amount,
    date: tx.date,
    note: sanitizeNote(tx.note || '', 120),
    createdAt,
    updatedAt
  };
}

function normalizeState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;

  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions.map(normalizeTransaction).filter(Boolean)
    : [];

  let goal = null;
  if (raw.goal && typeof raw.goal === 'object') {
    const gName = sanitizeGoalName(raw.goal.name);
    const gTarget = Number(raw.goal.targetAmount);
    if (gName.length > 0 && Number.isInteger(gTarget) && gTarget > 0 && gTarget <= MAX_AMOUNT) {
      goal = { name: gName, targetAmount: gTarget };
    }
  }

  const theme = raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : null;
  const lastBackupAt =
    typeof raw.lastBackupAt === 'string' && !Number.isNaN(Date.parse(raw.lastBackupAt)) ? raw.lastBackupAt : null;
  const changesSinceBackup =
    Number.isInteger(raw.changesSinceBackup) && raw.changesSinceBackup >= 0 ? raw.changesSinceBackup : 0;

  const rem = raw.reminder && typeof raw.reminder === 'object' ? raw.reminder : {};
  const reminder = {
    enabled: Boolean(rem.enabled),
    time: sanitizeTime(rem.time),
    lastNotifiedDate: isValidCalendarDate(rem.lastNotifiedDate) ? rem.lastNotifiedDate : null
  };

  return {
    version: 1,
    transactions,
    goal,
    theme,
    lastBackupAt,
    changesSinceBackup,
    reminder,
    welcomeCollapsed: Boolean(raw.welcomeCollapsed)
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (_) {
    return createDefaultState();
  }
}

export function saveState(state) {
  const normalized = normalizeState(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (err) {
    console.error('Gagal menyimpan ke localStorage:', err);
  }
  return normalized;
}

export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sortTransactionsDesc(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function sortTransactionsAsc(list) {
  return [...list].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function computeSummary(transactions) {
  const currentMonth = getTodayISO().slice(0, 7);
  let totalDeposit = 0;
  let depositCount = 0;
  let totalWithdraw = 0;
  let withdrawCount = 0;
  let thisMonthDeposit = 0;
  const monthDepositDays = new Set();

  for (const tx of transactions) {
    if (tx.type === 'deposit') {
      totalDeposit += tx.amount;
      depositCount++;
      if (tx.date.slice(0, 7) === currentMonth) {
        thisMonthDeposit += tx.amount;
        monthDepositDays.add(tx.date);
      }
    } else if (tx.type === 'withdraw') {
      totalWithdraw += tx.amount;
      withdrawCount++;
    }
  }

  return {
    totalDeposit,
    depositCount,
    totalWithdraw,
    withdrawCount,
    balance: totalDeposit - totalWithdraw,
    thisMonthDeposit,
    thisMonthSavingDays: monthDepositDays.size
  };
}

export function validateAndParseBackup(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return { ok: false, error: 'Isi JSON backup masih kosong.' };
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (_) {
    return { ok: false, error: 'Format JSON tidak valid. Periksa kembali isi file atau teks backup.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Struktur backup harus berupa objek JSON.' };
  }

  if (parsed.version !== 1) {
    return { ok: false, error: 'Versi backup tidak dikenali (harus versi 1).' };
  }

  if (!Array.isArray(parsed.transactions)) {
    return { ok: false, error: 'Daftar transaksi tidak ditemukan di dalam file backup.' };
  }

  const cleanTxs = [];
  const seenIds = new Set();
  for (let i = 0; i < parsed.transactions.length; i++) {
    const rawTx = parsed.transactions[i];
    if (!rawTx || typeof rawTx !== 'object') {
      return { ok: false, error: `Transaksi ke-${i + 1} tidak valid.` };
    }
    if (rawTx.type !== 'deposit' && rawTx.type !== 'withdraw') {
      return { ok: false, error: `Jenis transaksi ke-${i + 1} harus "deposit" atau "withdraw".` };
    }
    const amt = Number(rawTx.amount);
    if (!Number.isInteger(amt) || amt <= 0 || amt > MAX_AMOUNT) {
      return { ok: false, error: `Nominal transaksi ke-${i + 1} tidak valid.` };
    }
    if (!isValidCalendarDate(rawTx.date)) {
      return { ok: false, error: `Tanggal transaksi ke-${i + 1} (${rawTx.date}) tidak valid.` };
    }
    let id = typeof rawTx.id === 'string' && rawTx.id.trim() ? rawTx.id.trim().slice(0, 64) : generateId();
    if (seenIds.has(id)) id = generateId();
    seenIds.add(id);

    const nowIso = new Date().toISOString();
    cleanTxs.push({
      id,
      type: rawTx.type,
      amount: amt,
      date: rawTx.date,
      note: sanitizeNote(rawTx.note || '', 120),
      createdAt: typeof rawTx.createdAt === 'string' && !Number.isNaN(Date.parse(rawTx.createdAt)) ? rawTx.createdAt : nowIso,
      updatedAt: typeof rawTx.updatedAt === 'string' && !Number.isNaN(Date.parse(rawTx.updatedAt)) ? rawTx.updatedAt : nowIso
    });
  }

  let cleanGoal = null;
  if (parsed.goal !== null && parsed.goal !== undefined) {
    if (typeof parsed.goal !== 'object' || Array.isArray(parsed.goal)) {
      return { ok: false, error: 'Data target tabungan di backup tidak valid.' };
    }
    const gName = sanitizeGoalName(parsed.goal.name);
    const gTarget = Number(parsed.goal.targetAmount);
    if (!gName || !Number.isInteger(gTarget) || gTarget <= 0 || gTarget > MAX_AMOUNT) {
      return { ok: false, error: 'Nama atau nominal target tabungan di backup tidak valid.' };
    }
    cleanGoal = { name: gName, targetAmount: gTarget };
  }

  const normalized = normalizeState({
    version: 1,
    transactions: cleanTxs,
    goal: cleanGoal,
    theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : null,
    lastBackupAt: parsed.lastBackupAt || new Date().toISOString(),
    changesSinceBackup: 0,
    reminder: parsed.reminder,
    welcomeCollapsed: Boolean(parsed.welcomeCollapsed)
  });

  const summary = computeSummary(normalized.transactions);

  return {
    ok: true,
    data: normalized,
    preview: {
      txCount: normalized.transactions.length,
      balance: summary.balance,
      goalName: normalized.goal ? normalized.goal.name : null,
      lastBackupAt: parsed.lastBackupAt || null
    }
  };
}
