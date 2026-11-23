import {
  MAX_AMOUNT,
  bindCurrencyInput,
  escapeHtml,
  formatDateLongId,
  formatDateTimeId,
  formatMonthLabel,
  formatRupiah,
  getGreetingInfo,
  getTodayISO,
  isValidCalendarDate
} from './format.js';
import {
  computeSummary,
  generateId,
  loadState,
  saveState,
  sortTransactionsDesc,
  validateAndParseBackup
} from './storage.js';
import { renderSavingsChart } from './chart.js';
import { buildStandaloneOfflineHtml } from './offline-export.js';

let appState = loadState();
let currentTab = 'beranda';
let chartMode = 'line';
let chartRange = '7d';
let chartSelectedIndex = null;
let animateChartNext = true;

// History filter state
let historyTypeFilter = 'all';
let historySearch = '';
let historyMonthFilter = 'all';
let historyLimit = 50;

// Modal edit state
let editingTxId = null;
let modalTxType = 'deposit';
let confirmCallback = null;
let pendingRestoreData = null;

// Toast & Undo state
let toastTimer = null;
let lastDeletedTx = null;

// PWA Install prompt
let deferredInstallPrompt = null;

// Currency input bindings
let txCurrencyCtrl = null;
let goalCurrencyCtrl = null;

function resolveTheme() {
  if (appState.theme === 'light' || appState.theme === 'dark') {
    return appState.theme;
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('meta-theme-color');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0D1110' : '#F6F7F5');
  }
  if (window.TabunganAndroid && typeof window.TabunganAndroid.setTheme === 'function') {
    try {
      window.TabunganAndroid.setTheme(theme);
    } catch (_) {}
  }

  const toggle = document.getElementById('toggle-theme');
  const label = document.getElementById('theme-status-label');
  const isDark = theme === 'dark';
  if (toggle) {
    toggle.classList.toggle('on', isDark);
    toggle.setAttribute('aria-checked', String(isDark));
  }
  if (label) {
    label.textContent = isDark ? 'Aktif: Mode Gelap' : 'Aktif: Mode Terang';
  }
}

function persistState(markChange = false) {
  if (markChange) {
    appState.changesSinceBackup = (appState.changesSinceBackup || 0) + 1;
    animateChartNext = true;
  }
  appState = saveState(appState);
  renderAll();
}

function showToast(message, actionLabel = null, onAction = null, durationMs = 3400) {
  const toast = document.getElementById('app-toast');
  const msgEl = document.getElementById('toast-message');
  const actBtn = document.getElementById('toast-action-btn');
  if (!toast || !msgEl || !actBtn) return;

  if (toastTimer) clearTimeout(toastTimer);
  msgEl.textContent = message;

  if (actionLabel && typeof onAction === 'function') {
    actBtn.textContent = actionLabel;
    actBtn.style.display = 'inline-block';
    actBtn.onclick = () => {
      hideToast();
      onAction();
    };
  } else {
    actBtn.style.display = 'none';
    actBtn.onclick = null;
  }

  toast.classList.add('show');
  toastTimer = setTimeout(hideToast, durationMs);
}

function hideToast() {
  const toast = document.getElementById('app-toast');
  if (toast) toast.classList.remove('show');
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function switchTab(tabName) {
  currentTab = tabName;
  document.querySelectorAll('.page-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === `page-${tabName}`);
  });
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav') === tabName);
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function renderWelcome() {
  const info = getGreetingInfo();
  const titleEl = document.getElementById('welcome-greeting-title');
  const subEl = document.getElementById('welcome-greeting-sub');
  const compactEl = document.getElementById('welcome-compact-greeting');
  const expEl = document.getElementById('welcome-expanded');
  const colEl = document.getElementById('welcome-collapsed');
  const heroImg = document.getElementById('welcome-hero-img');

  if (titleEl) titleEl.textContent = info.title;
  if (subEl) subEl.textContent = info.subtitle;
  if (compactEl) compactEl.textContent = `${info.title} ${info.subtitle}`;

  if (heroImg && window.__TABUNGAN_HERO_SRC__) {
    heroImg.src = window.__TABUNGAN_HERO_SRC__;
  }

  const collapsed = Boolean(appState.welcomeCollapsed);
  if (expEl) expEl.style.display = collapsed ? 'none' : 'block';
  if (colEl) colEl.style.display = collapsed ? 'flex' : 'none';
}

function renderHomeSummary(summary) {
  const balEl = document.getElementById('home-balance');
  if (balEl) {
    balEl.textContent = formatRupiah(summary.balance);
    balEl.classList.toggle('neg', summary.balance < 0);
  }
  const depEl = document.getElementById('home-total-deposit');
  const depCntEl = document.getElementById('home-deposit-count');
  const witEl = document.getElementById('home-total-withdraw');
  const witCntEl = document.getElementById('home-withdraw-count');
  const monthEl = document.getElementById('home-month-summary');

  if (depEl) depEl.textContent = formatRupiah(summary.totalDeposit);
  if (depCntEl) depCntEl.textContent = `${summary.depositCount} transaksi`;
  if (witEl) witEl.textContent = formatRupiah(summary.totalWithdraw);
  if (witCntEl) witCntEl.textContent = `${summary.withdrawCount} transaksi`;
  if (monthEl) {
    monthEl.textContent = `Bulan ini: +${formatRupiah(summary.thisMonthDeposit)} dari ${summary.thisMonthSavingDays} hari menabung`;
  }
}

function renderHomeGoal(summary) {
  const body = document.getElementById('goal-summary-body');
  const sub = document.getElementById('home-goal-subtitle');
  const actBtn = document.getElementById('btn-home-goal-action');
  if (!body) return;

  if (!appState.goal) {
    if (sub) sub.textContent = 'Belum ada target tabungan';
    if (actBtn) actBtn.textContent = 'Atur Target';
    body.innerHTML = `
      <div style="font-size:13.5px; color:var(--text-muted);">
        Buat target tabungan agar progres menabungmu lebih terarah.
      </div>
    `;
    return;
  }

  const { name, targetAmount } = appState.goal;
  const collected = Math.max(0, summary.balance);
  const rawPct = targetAmount > 0 ? (collected / targetAmount) * 100 : 0;
  const pct = Math.max(0, Math.min(100, Math.round(rawPct)));
  const remaining = Math.max(0, targetAmount - collected);

  if (sub) sub.textContent = name;
  if (actBtn) actBtn.textContent = 'Detail';

  body.innerHTML = `
    <div class="progress-meta">
      <span>Terkumpul <strong>${escapeHtml(formatRupiah(collected))}</strong></span>
      <span class="progress-pct">${pct}%</span>
    </div>
    <div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill" style="width:${pct}%"></div>
    </div>
    <div class="progress-meta">
      <span>Target: ${escapeHtml(formatRupiah(targetAmount))}</span>
      <span>${remaining === 0 ? 'Target tercapai!' : `Kurang ${escapeHtml(formatRupiah(remaining))}`}</span>
    </div>
  `;
}

function renderChart() {
  const subtitleEl = document.getElementById('chart-range-subtitle');
  const readoutSlot = document.getElementById('chart-readout-slot');
  const svgSlot = document.getElementById('chart-svg-slot');
  if (!readoutSlot || !svgSlot) return;

  const shouldAnimate = animateChartNext;
  animateChartNext = false;

  const result = renderSavingsChart({
    transactions: appState.transactions,
    mode: chartMode,
    range: chartRange,
    selectedIndex: chartSelectedIndex,
    containerWidth: svgSlot.clientWidth || 380,
    animateTransition: shouldAnimate,
    onSelectIndex: (idx) => {
      chartSelectedIndex = idx;
      renderChart();
    }
  });

  if (subtitleEl) subtitleEl.textContent = result.rangeText;
  readoutSlot.innerHTML = result.readoutHtml;
  svgSlot.innerHTML = result.svgHtml;
  result.bindEvents(svgSlot);
}

function createTxRowHtml(tx, showActions = false) {
  const isDeposit = tx.type === 'deposit';
  const sign = isDeposit ? '+' : '-';
  const cls = isDeposit ? 'pos' : 'neg';
  const defaultTitle = isDeposit ? 'Tabungan Masuk' : 'Ambil Tabungan';
  const title = tx.note ? escapeHtml(tx.note) : defaultTitle;
  const dateLabel = formatDateLongId(tx.date);

  return `
    <div class="tx-item" data-tx-id="${escapeHtml(tx.id)}">
      <div class="tx-left">
        <div class="tx-icon ${cls}" aria-hidden="true">${sign}</div>
        <div class="tx-info">
          <div class="tx-title">${title}</div>
          <div class="tx-meta">${escapeHtml(dateLabel)}${tx.note ? ` · ${defaultTitle}` : ''}</div>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${cls}">${sign}${escapeHtml(formatRupiah(tx.amount))}</div>
        ${
          showActions
            ? `<div class="tx-actions">
                <button type="button" class="icon-btn-sm" data-edit-tx="${escapeHtml(tx.id)}">Edit</button>
                <button type="button" class="icon-btn-sm danger" data-delete-tx="${escapeHtml(tx.id)}">Hapus</button>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

function renderRecentTransactions() {
  const listEl = document.getElementById('recent-tx-list');
  if (!listEl) return;

  const sorted = sortTransactionsDesc(appState.transactions).slice(0, 4);
  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="empty-box">
        Belum ada catatan tabungan. Tekan <strong>+ Tabung</strong> untuk memulai.
      </div>
    `;
    return;
  }

  listEl.innerHTML = sorted.map((tx) => createTxRowHtml(tx, false)).join('');
}

function renderHistory() {
  const listEl = document.getElementById('history-tx-list');
  const subEl = document.getElementById('history-count-subtitle');
  const monthSelect = document.getElementById('history-month');
  const loadMoreWrap = document.getElementById('history-load-more-wrap');
  if (!listEl) return;

  // Populate dynamic YYYY-MM options
  if (monthSelect) {
    const months = Array.from(new Set(appState.transactions.map((t) => t.date.slice(0, 7)))).sort((a, b) =>
      b.localeCompare(a)
    );
    const prevVal = historyMonthFilter;
    monthSelect.innerHTML =
      '<option value="all">Semua Bulan</option>' +
      months.map((ym) => `<option value="${escapeHtml(ym)}">${escapeHtml(formatMonthLabel(ym))}</option>`).join('');
    historyMonthFilter = months.includes(prevVal) ? prevVal : 'all';
    monthSelect.value = historyMonthFilter;
  }

  const query = historySearch.trim().toLowerCase();
  const filtered = sortTransactionsDesc(appState.transactions).filter((tx) => {
    if (historyTypeFilter !== 'all' && tx.type !== historyTypeFilter) return false;
    if (historyMonthFilter !== 'all' && tx.date.slice(0, 7) !== historyMonthFilter) return false;
    if (query) {
      const hay = `${tx.note} ${tx.date} ${formatDateLongId(tx.date)}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  if (subEl) {
    subEl.textContent = `${filtered.length} dari ${appState.transactions.length} transaksi`;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-box">Tidak ada transaksi yang cocok dengan filter ini.</div>`;
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }

  const visible = filtered.slice(0, historyLimit);
  listEl.innerHTML = visible.map((tx) => createTxRowHtml(tx, true)).join('');

  if (loadMoreWrap) {
    loadMoreWrap.style.display = filtered.length > historyLimit ? 'block' : 'none';
  }
}

function renderGoalPage(summary) {
  const detailCard = document.getElementById('goal-detail-card');
  const formTitle = document.getElementById('goal-form-title');
  const nameInput = document.getElementById('goal-name-input');
  const nameCounter = document.getElementById('goal-name-counter');
  const delBtn = document.getElementById('btn-delete-goal');
  if (!detailCard) return;

  if (!appState.goal) {
    detailCard.innerHTML = `
      <div class="card-header">
        <div>
          <h2 class="card-title">Progres Target Tabungan</h2>
          <p class="card-subtitle">Belum ada target aktif</p>
        </div>
      </div>
      <div class="empty-box">
        Tentukan nama target dan nominal impianmu di formulir sebelah untuk melihat estimasi tabungan harian.
      </div>
    `;
    if (formTitle) formTitle.textContent = 'Buat Target Tabungan';
    if (delBtn) delBtn.style.display = 'none';
  } else {
    const { name, targetAmount } = appState.goal;
    const collected = Math.max(0, summary.balance);
    const pct = Math.max(0, Math.min(100, Math.round((collected / targetAmount) * 100)));
    const remaining = Math.max(0, targetAmount - collected);
    const dailyEstimate30 = remaining > 0 ? Math.ceil(remaining / 30) : 0;

    detailCard.innerHTML = `
      <div class="card-header">
        <div>
          <h2 class="card-title">${escapeHtml(name)}</h2>
          <p class="card-subtitle">${remaining === 0 ? 'Selamat! Target sudah tercapai' : 'Target tabungan aktif'}</p>
        </div>
        <span class="progress-pct" style="font-size:20px;">${pct}%</span>
      </div>

      <div class="progress-track" style="height:14px;">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>

      <div class="stats-row" style="margin-top:14px;">
        <div class="stat-box">
          <div class="stat-label">Terkumpul</div>
          <div class="stat-value pos">${escapeHtml(formatRupiah(collected))}</div>
          <div class="stat-count">Dari total saldo aktif</div>
        </div>
        <div class="stat-box">
          <div class="stat-label">Target</div>
          <div class="stat-value">${escapeHtml(formatRupiah(targetAmount))}</div>
          <div class="stat-count">${remaining === 0 ? 'Tercapai' : `Kurang ${escapeHtml(formatRupiah(remaining))}`}</div>
        </div>
      </div>

      <div class="month-pill" style="margin-top:14px; background:var(--accent-soft); color:var(--accent);">
        ${
          remaining === 0
            ? 'Targetmu sudah terpenuhi 100%! Kamu bisa memperbarui target baru kapan saja.'
            : `Estimasi untuk 30 hari: sisihkan sekitar ${escapeHtml(formatRupiah(dailyEstimate30))}/hari.`
        }
      </div>
    `;

    if (formTitle) formTitle.textContent = 'Ubah Target Tabungan';
    if (delBtn) delBtn.style.display = 'inline-flex';
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = name;
      if (nameCounter) nameCounter.textContent = `${name.length}/60`;
    }
    if (goalCurrencyCtrl && document.activeElement !== document.getElementById('goal-amount-input')) {
      goalCurrencyCtrl.setAmount(targetAmount);
    }
  }
}

function renderSettingsPage() {
  const remToggle = document.getElementById('toggle-reminder');
  const remTime = document.getElementById('reminder-time-input');
  const remStatus = document.getElementById('reminder-permission-status');
  const lastBackupPill = document.getElementById('backup-last-pill');
  const changesPill = document.getElementById('backup-changes-pill');

  if (remToggle) {
    remToggle.classList.toggle('on', Boolean(appState.reminder.enabled));
    remToggle.setAttribute('aria-checked', String(Boolean(appState.reminder.enabled)));
  }
  if (remTime && document.activeElement !== remTime) {
    remTime.value = appState.reminder.time || '20:00';
  }
  if (remStatus) {
    if (!('Notification' in window)) {
      remStatus.textContent = 'Menggunakan pengingat toast di dalam aplikasi';
    } else if (Notification.permission === 'granted') {
      remStatus.textContent = 'Izin notifikasi aktif';
    } else if (Notification.permission === 'denied') {
      remStatus.textContent = 'Notifikasi browser diblokir — fallback toast aktif';
    } else {
      remStatus.textContent = 'Aktifkan untuk meminta izin notifikasi';
    }
  }

  if (lastBackupPill) {
    lastBackupPill.textContent = `Backup terakhir: ${formatDateTimeId(appState.lastBackupAt)}`;
  }
  if (changesPill) {
    const ch = appState.changesSinceBackup || 0;
    changesPill.textContent = ch === 0 ? 'Semua perubahan sudah di-backup' : `${ch} perubahan belum di-backup`;
  }
}

function renderAll() {
  applyTheme(resolveTheme());
  const summary = computeSummary(appState.transactions);
  renderWelcome();
  renderHomeSummary(summary);
  renderHomeGoal(summary);
  renderChart();
  renderRecentTransactions();
  renderHistory();
  renderGoalPage(summary);
  renderSettingsPage();
}

// Modal: Transaction Add/Edit
function updateOverdraftWarning() {
  const warn = document.getElementById('tx-overdraft-warning');
  if (!warn) return;
  if (modalTxType !== 'withdraw') {
    warn.style.display = 'none';
    return;
  }
  const amount = txCurrencyCtrl ? txCurrencyCtrl.getAmount() : 0;
  let available = computeSummary(appState.transactions).balance;
  if (editingTxId) {
    const existing = appState.transactions.find((t) => t.id === editingTxId);
    if (existing) {
      available += existing.type === 'deposit' ? -existing.amount : existing.amount;
    }
  }
  warn.style.display = amount > 0 && amount > available ? 'block' : 'none';
}

function setModalTxType(type) {
  modalTxType = type === 'withdraw' ? 'withdraw' : 'deposit';
  document.querySelectorAll('[data-tx-type]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-tx-type') === modalTxType);
  });
  updateOverdraftWarning();
}

function openTxModal({ type = 'deposit', tx = null } = {}) {
  const modal = document.getElementById('tx-modal');
  const titleEl = document.getElementById('tx-modal-title');
  const dateInput = document.getElementById('tx-date-input');
  const noteInput = document.getElementById('tx-note-input');
  const noteCounter = document.getElementById('tx-note-counter');
  const errEl = document.getElementById('tx-form-error');
  if (!modal) return;

  if (errEl) errEl.style.display = 'none';

  if (tx) {
    editingTxId = tx.id;
    if (titleEl) titleEl.textContent = 'Edit Transaksi';
    setModalTxType(tx.type);
    if (txCurrencyCtrl) txCurrencyCtrl.setAmount(tx.amount);
    if (dateInput) dateInput.value = tx.date;
    if (noteInput) noteInput.value = tx.note || '';
    if (noteCounter) noteCounter.textContent = `${(tx.note || '').length}/120`;
  } else {
    editingTxId = null;
    if (titleEl) titleEl.textContent = 'Catat Transaksi';
    setModalTxType(type);
    if (txCurrencyCtrl) txCurrencyCtrl.setAmount(0);
    if (dateInput) dateInput.value = getTodayISO();
    if (noteInput) noteInput.value = '';
    if (noteCounter) noteCounter.textContent = '0/120';
  }

  updateOverdraftWarning();
  modal.classList.add('open');
  setTimeout(() => {
    document.getElementById('tx-amount-input')?.focus();
  }, 40);
}

function closeTxModal() {
  document.getElementById('tx-modal')?.classList.remove('open');
}

function openConfirmModal(title, message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const titleEl = document.getElementById('confirm-title');
  const msgEl = document.getElementById('confirm-message');
  if (!modal) return;
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = message;
  confirmCallback = onConfirm;
  modal.classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal')?.classList.remove('open');
  confirmCallback = null;
}

function deleteTransactionWithUndo(txId) {
  const idx = appState.transactions.findIndex((t) => t.id === txId);
  if (idx === -1) return;
  const removed = appState.transactions[idx];
  openConfirmModal(
    'Hapus Transaksi?',
    `Catatan ${removed.type === 'deposit' ? 'tabungan masuk' : 'pengambilan'} sebesar ${formatRupiah(removed.amount)} pada ${formatDateLongId(removed.date)} akan dihapus.`,
    () => {
      lastDeletedTx = { tx: removed, index: idx };
      appState.transactions.splice(idx, 1);
      chartSelectedIndex = null;
      persistState(true);
      showToast(
        'Transaksi dihapus.',
        'Urungkan',
        () => {
          if (!lastDeletedTx) return;
          const restoreIdx = Math.min(lastDeletedTx.index, appState.transactions.length);
          appState.transactions.splice(restoreIdx, 0, lastDeletedTx.tx);
          lastDeletedTx = null;
          persistState(true);
          showToast('Transaksi dikembalikan.');
        },
        6000
      );
    }
  );
}

// Download / Android Bridge helper
function downloadFileUniversal(fileName, content, mimeType) {
  if (window.TabunganAndroid && typeof window.TabunganAndroid.saveBackup === 'function') {
    try {
      window.TabunganAndroid.saveBackup(fileName, content);
      return true;
    } catch (err) {
      console.error(err);
    }
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 500);
  return true;
}

function buildBackupPayload() {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions: appState.transactions,
      goal: appState.goal,
      theme: appState.theme,
      lastBackupAt: new Date().toISOString(),
      changesSinceBackup: 0,
      reminder: appState.reminder,
      welcomeCollapsed: appState.welcomeCollapsed
    },
    null,
    2
  );
}

function showRestorePreview(rawText) {
  const slot = document.getElementById('restore-preview-slot');
  if (!slot) return;
  const result = validateAndParseBackup(rawText);
  if (!result.ok) {
    pendingRestoreData = null;
    slot.innerHTML = `<div class="error-text" style="margin-top:10px;">${escapeHtml(result.error)}</div>`;
    return;
  }
  pendingRestoreData = result.data;
  const p = result.preview;
  slot.innerHTML = `
    <div class="preview-box">
      <div style="font-weight:700; margin-bottom:6px; color:var(--pos);">Data Backup Valid &amp; Siap Dipulihkan</div>
      <div class="preview-row"><span>Jumlah transaksi</span><strong>${p.txCount} catatan</strong></div>
      <div class="preview-row"><span>Pratinjau total saldo</span><strong>${escapeHtml(formatRupiah(p.balance))}</strong></div>
      <div class="preview-row"><span>Target tabungan</span><strong>${p.goalName ? escapeHtml(p.goalName) : 'Tidak ada'}</strong></div>
      <div class="btn-row" style="margin-top:12px;">
        <button type="button" class="btn-secondary" id="btn-cancel-restore">Batal</button>
        <button type="button" class="btn-primary" id="btn-confirm-restore">Pulihkan Data</button>
      </div>
    </div>
  `;
  document.getElementById('btn-cancel-restore')?.addEventListener('click', () => {
    pendingRestoreData = null;
    slot.innerHTML = '';
  });
  document.getElementById('btn-confirm-restore')?.addEventListener('click', () => {
    if (!pendingRestoreData) return;
    appState = saveState(pendingRestoreData);
    pendingRestoreData = null;
    slot.innerHTML = '';
    const txt = document.getElementById('restore-text-input');
    if (txt) txt.value = '';
    chartSelectedIndex = null;
    renderAll();
    showToast('Data berhasil dipulihkan!');
  });
}

// Daily Reminder Engine
function triggerReminderNotification(isTest = false) {
  const title = 'Pengingat TabunganSaya';
  const body = isTest
    ? 'Ini uji pengingat harianmu. Yuk catat tabungan hari ini!'
    : 'Waktunya menyisihkan dan mencatat tabungan harianmu.';

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: './icons/icon-192.png' });
    } catch (_) {}
  }

  showToast(
    body,
    'Catat',
    () => openTxModal({ type: 'deposit' }),
    6000
  );
}

function checkReminderSchedule() {
  if (!appState.reminder.enabled) return;
  const now = new Date();
  const today = getTodayISO();
  if (appState.reminder.lastNotifiedDate === today) return;

  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const currentHHMM = `${hh}:${mm}`;
  if (currentHHMM >= (appState.reminder.time || '20:00')) {
    appState.reminder.lastNotifiedDate = today;
    saveState(appState);
    triggerReminderNotification(false);
  }
}

function initEvents() {
  // Navigation
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-nav')));
  });

  document.getElementById('topbar-quick-add')?.addEventListener('click', () => openTxModal({ type: 'deposit' }));
  document.getElementById('btn-home-deposit')?.addEventListener('click', () => openTxModal({ type: 'deposit' }));
  document.getElementById('btn-home-withdraw')?.addEventListener('click', () => openTxModal({ type: 'withdraw' }));
  document.getElementById('btn-history-add')?.addEventListener('click', () => openTxModal({ type: 'deposit' }));
  document.getElementById('btn-see-all-history')?.addEventListener('click', () => switchTab('riwayat'));
  document.getElementById('btn-home-goal-action')?.addEventListener('click', () => switchTab('target'));

  // Welcome toggle
  document.getElementById('btn-hide-welcome')?.addEventListener('click', () => {
    appState.welcomeCollapsed = true;
    persistState(false);
  });
  document.getElementById('btn-show-welcome')?.addEventListener('click', () => {
    appState.welcomeCollapsed = false;
    persistState(false);
  });

  // Chart controls
  document.querySelectorAll('[data-chart-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      chartMode = btn.getAttribute('data-chart-mode');
      chartSelectedIndex = null;
      animateChartNext = true;
      document.querySelectorAll('[data-chart-mode]').forEach((b) => b.classList.toggle('active', b === btn));
      renderChart();
    });
  });
  document.querySelectorAll('[data-chart-range]').forEach((btn) => {
    btn.addEventListener('click', () => {
      chartRange = btn.getAttribute('data-chart-range');
      chartSelectedIndex = null;
      animateChartNext = true;
      document.querySelectorAll('[data-chart-range]').forEach((b) => b.classList.toggle('active', b === btn));
      renderChart();
    });
  });

  // Tx modal controls
  txCurrencyCtrl = bindCurrencyInput(document.getElementById('tx-amount-input'), () => updateOverdraftWarning());
  goalCurrencyCtrl = bindCurrencyInput(document.getElementById('goal-amount-input'));

  document.querySelectorAll('[data-tx-type]').forEach((btn) => {
    btn.addEventListener('click', () => setModalTxType(btn.getAttribute('data-tx-type')));
  });

  document.querySelectorAll('[data-quick-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const addVal = Number(btn.getAttribute('data-quick-add')) || 0;
      const cur = txCurrencyCtrl.getAmount();
      txCurrencyCtrl.setAmount(Math.min(MAX_AMOUNT, cur + addVal));
      updateOverdraftWarning();
    });
  });
  document.getElementById('btn-quick-reset')?.addEventListener('click', () => {
    txCurrencyCtrl.setAmount(0);
    updateOverdraftWarning();
  });

  const noteInput = document.getElementById('tx-note-input');
  const noteCounter = document.getElementById('tx-note-counter');
  noteInput?.addEventListener('input', () => {
    if (noteCounter) noteCounter.textContent = `${noteInput.value.length}/120`;
  });

  document.getElementById('btn-close-tx-modal')?.addEventListener('click', closeTxModal);
  document.getElementById('tx-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'tx-modal') closeTxModal();
  });

  document.getElementById('tx-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('tx-form-error');
    const amount = txCurrencyCtrl.getAmount();
    const dateVal = document.getElementById('tx-date-input').value;
    const noteVal = document.getElementById('tx-note-input').value.trim().slice(0, 120);

    if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      errEl.textContent = 'Masukkan nominal tabungan yang valid (minimal Rp1).';
      errEl.style.display = 'block';
      return;
    }
    if (!isValidCalendarDate(dateVal)) {
      errEl.textContent = 'Tanggal tidak valid sesuai kalender.';
      errEl.style.display = 'block';
      return;
    }

    const nowIso = new Date().toISOString();
    if (editingTxId) {
      const idx = appState.transactions.findIndex((t) => t.id === editingTxId);
      if (idx !== -1) {
        appState.transactions[idx] = {
          ...appState.transactions[idx],
          type: modalTxType,
          amount,
          date: dateVal,
          note: noteVal,
          updatedAt: nowIso
        };
      }
      closeTxModal();
      chartSelectedIndex = null;
      persistState(true);
      showToast('Transaksi diperbarui.');
    } else {
      appState.transactions.push({
        id: generateId(),
        type: modalTxType,
        amount,
        date: dateVal,
        note: noteVal,
        createdAt: nowIso,
        updatedAt: nowIso
      });
      closeTxModal();
      chartSelectedIndex = null;
      persistState(true);
      showToast(modalTxType === 'deposit' ? 'Tabungan berhasil dicatat!' : 'Pengambilan berhasil dicatat.');
    }
  });

  // History filters & actions
  document.querySelectorAll('[data-history-type]').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyTypeFilter = btn.getAttribute('data-history-type');
      historyLimit = 50;
      document.querySelectorAll('[data-history-type]').forEach((b) => b.classList.toggle('active', b === btn));
      renderHistory();
    });
  });

  document.getElementById('history-search')?.addEventListener('input', (e) => {
    historySearch = e.target.value;
    historyLimit = 50;
    renderHistory();
  });

  document.getElementById('history-month')?.addEventListener('change', (e) => {
    historyMonthFilter = e.target.value;
    historyLimit = 50;
    renderHistory();
  });

  document.getElementById('btn-history-load-more')?.addEventListener('click', () => {
    historyLimit += 50;
    renderHistory();
  });

  document.getElementById('history-tx-list')?.addEventListener('click', (e) => {
    const editBtn = e.target.closest('[data-edit-tx]');
    if (editBtn) {
      const id = editBtn.getAttribute('data-edit-tx');
      const tx = appState.transactions.find((t) => t.id === id);
      if (tx) openTxModal({ tx });
      return;
    }
    const delBtn = e.target.closest('[data-delete-tx]');
    if (delBtn) {
      const id = delBtn.getAttribute('data-delete-tx');
      deleteTransactionWithUndo(id);
    }
  });

  // Confirm modal
  document.getElementById('btn-confirm-cancel')?.addEventListener('click', closeConfirmModal);
  document.getElementById('btn-confirm-no')?.addEventListener('click', closeConfirmModal);
  document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirm-modal') closeConfirmModal();
  });
  document.getElementById('btn-confirm-yes')?.addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirmModal();
    if (typeof cb === 'function') cb();
  });

  // Goal form
  const goalNameInput = document.getElementById('goal-name-input');
  const goalNameCounter = document.getElementById('goal-name-counter');
  goalNameInput?.addEventListener('input', () => {
    if (goalNameCounter) goalNameCounter.textContent = `${goalNameInput.value.length}/60`;
  });

  document.getElementById('goal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const errEl = document.getElementById('goal-form-error');
    const name = goalNameInput.value.trim().slice(0, 60);
    const targetAmount = goalCurrencyCtrl.getAmount();
    if (!name) {
      errEl.textContent = 'Nama target tidak boleh kosong.';
      errEl.style.display = 'block';
      return;
    }
    if (!Number.isInteger(targetAmount) || targetAmount <= 0 || targetAmount > MAX_AMOUNT) {
      errEl.textContent = 'Masukkan nominal target yang valid (minimal Rp1).';
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';
    appState.goal = { name, targetAmount };
    persistState(true);
    showToast('Target tabungan disimpan!');
  });

  document.getElementById('btn-delete-goal')?.addEventListener('click', () => {
    if (!appState.goal) return;
    openConfirmModal(
      'Hapus Target Tabungan?',
      `Target "${appState.goal.name}" akan dihapus. Total saldo tabunganmu tidak berubah.`,
      () => {
        appState.goal = null;
        goalNameInput.value = '';
        if (goalNameCounter) goalNameCounter.textContent = '0/60';
        goalCurrencyCtrl.setAmount(0);
        persistState(true);
        showToast('Target tabungan dihapus.');
      }
    );
  });

  // Settings: Theme
  document.getElementById('toggle-theme')?.addEventListener('click', () => {
    const next = resolveTheme() === 'dark' ? 'light' : 'dark';
    appState.theme = next;
    persistState(false);
  });

  // Settings: Offline HTML Export
  document.getElementById('btn-download-offline-html')?.addEventListener('click', async () => {
    try {
      let htmlString;
      if (window.__TABUNGAN_STANDALONE__) {
        htmlString = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
      } else {
        htmlString = await buildStandaloneOfflineHtml();
      }
      downloadFileUniversal('TabunganSaya-Offline.html', htmlString, 'text/html;charset=utf-8');
      showToast('File offline HTML siap disimpan!');
    } catch (err) {
      showToast('Gagal menyiapkan file offline HTML.');
    }
  });

  // Settings: Install PWA
  document.getElementById('btn-install-pwa')?.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const res = await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      if (res && res.outcome === 'accepted') {
        showToast('TabunganSaya dipasang ke layar utama!');
      }
      return;
    }
    document.getElementById('install-modal')?.classList.add('open');
  });
  document.getElementById('btn-close-install')?.addEventListener('click', () => {
    document.getElementById('install-modal')?.classList.remove('open');
  });
  document.getElementById('install-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'install-modal') e.target.classList.remove('open');
  });
  document.getElementById('btn-copy-app-link')?.addEventListener('click', async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link aplikasi disalin.');
    } catch (_) {
      showToast('Salin link langsung dari bilah alamat browser.');
    }
  });

  // Settings: Reminder
  document.getElementById('toggle-reminder')?.addEventListener('click', async () => {
    const nextEnabled = !appState.reminder.enabled;
    appState.reminder.enabled = nextEnabled;
    if (nextEnabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_) {}
    }
    persistState(false);
    showToast(nextEnabled ? 'Pengingat harian diaktifkan.' : 'Pengingat harian dimatikan.');
  });

  document.getElementById('reminder-time-input')?.addEventListener('change', (e) => {
    appState.reminder.time = e.target.value || '20:00';
    persistState(false);
    showToast(`Jam pengingat diubah ke ${appState.reminder.time}.`);
  });

  document.getElementById('btn-test-reminder')?.addEventListener('click', async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (_) {}
    }
    renderSettingsPage();
    triggerReminderNotification(true);
  });

  // Settings: Backup & Restore
  document.getElementById('btn-download-backup')?.addEventListener('click', () => {
    const payload = buildBackupPayload();
    const today = getTodayISO();
    downloadFileUniversal(`tabungansaya-backup-${today}.json`, payload, 'application/json;charset=utf-8');
    appState.lastBackupAt = new Date().toISOString();
    appState.changesSinceBackup = 0;
    persistState(false);
    showToast('Backup JSON berhasil dibuat!');
  });

  document.getElementById('btn-copy-backup')?.addEventListener('click', async () => {
    const payload = buildBackupPayload();
    try {
      await navigator.clipboard.writeText(payload);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = payload;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    appState.lastBackupAt = new Date().toISOString();
    appState.changesSinceBackup = 0;
    persistState(false);
    showToast('Teks backup JSON disalin ke clipboard.');
  });

  const fileInput = document.getElementById('restore-file-input');
  document.getElementById('btn-pick-restore-file')?.addEventListener('click', () => {
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const txtArea = document.getElementById('restore-text-input');
      if (txtArea) txtArea.value = text;
      showRestorePreview(text);
    };
    reader.onerror = () => {
      showToast('Gagal membaca file backup.');
    };
    reader.readAsText(file, 'UTF-8');
  });

  document.getElementById('btn-preview-restore-text')?.addEventListener('click', () => {
    const text = document.getElementById('restore-text-input')?.value || '';
    showRestorePreview(text);
  });

  // PWA install event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });

  // Responsive chart re-render on resize/orientation change
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentTab === 'beranda') renderChart();
    }, 120);
  });

  // Android Hardware Back integration
  window.__handleAndroidBack = () => {
    const txOpen = document.getElementById('tx-modal')?.classList.contains('open');
    if (txOpen) {
      closeTxModal();
      return true;
    }
    const confirmOpen = document.getElementById('confirm-modal')?.classList.contains('open');
    if (confirmOpen) {
      closeConfirmModal();
      return true;
    }
    const installOpen = document.getElementById('install-modal')?.classList.contains('open');
    if (installOpen) {
      document.getElementById('install-modal')?.classList.remove('open');
      return true;
    }
    if (currentTab !== 'beranda') {
      switchTab('beranda');
      return true;
    }
    return false;
  };
}

function registerServiceWorker() {
  if (window.__TABUNGAN_STANDALONE__) return;
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function bootstrap() {
  initEvents();
  renderAll();
  registerServiceWorker();
  checkReminderSchedule();
  setInterval(checkReminderSchedule, 30000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
