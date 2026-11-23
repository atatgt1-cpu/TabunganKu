import {
  addDaysISO,
  escapeHtml,
  formatCompactIdr,
  formatDateLongId,
  formatDateShortId,
  formatRelativeDayLabel,
  formatRupiah,
  formatRupiahSigned,
  getShortDayId,
  getTodayISO
} from './format.js';
import { sortTransactionsAsc } from './storage.js';

export function niceCeil(val) {
  if (val <= 0) return 10000;
  const exp = Math.floor(Math.log10(val));
  const pow = Math.pow(10, exp);
  const frac = val / pow;
  let niceFrac;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 2.5) niceFrac = 2.5;
  else if (frac <= 5) niceFrac = 5;
  else niceFrac = 10;
  return niceFrac * pow;
}

function filterByRange(sortedAsc, range) {
  if (sortedAsc.length === 0 || range === 'all') {
    return { items: sortedAsc, baseBalance: 0 };
  }
  const days = range === '7d' ? 7 : 30;
  const today = getTodayISO();
  const latestTxDate = sortedAsc[sortedAsc.length - 1].date;
  const anchor = latestTxDate > today ? latestTxDate : today;
  const cutoff = addDaysISO(anchor, -(days - 1));

  let baseBalance = 0;
  const items = [];
  for (const tx of sortedAsc) {
    const delta = tx.type === 'deposit' ? tx.amount : -tx.amount;
    if (tx.date < cutoff) {
      baseBalance += delta;
    } else {
      items.push(tx);
    }
  }
  return { items, baseBalance };
}

function buildXAxisTicks(points, minGap = 54) {
  const ticks = [];
  const seenDates = new Set();
  let lastX = -Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (seenDates.has(pt.date)) continue;
    if (pt.x - lastX >= minGap) {
      ticks.push({
        x: pt.x,
        date: pt.date,
        dayLabel: getShortDayId(pt.date),
        dateLabel: formatDateShortId(pt.date)
      });
      seenDates.add(pt.date);
      lastX = pt.x;
    }
  }

  if (points.length > 0) {
    const lastPt = points[points.length - 1];
    if (!seenDates.has(lastPt.date)) {
      if (ticks.length === 0 || lastPt.x - ticks[ticks.length - 1].x >= minGap * 0.72) {
        ticks.push({
          x: lastPt.x,
          date: lastPt.date,
          dayLabel: getShortDayId(lastPt.date),
          dateLabel: formatDateShortId(lastPt.date)
        });
      }
    }
  }
  return ticks;
}

function renderValuePill(x, y, text, toneClass, padLeft, rightEdge, padTop) {
  const pillW = Math.max(46, text.length * 6.8 + 14);
  const pillH = 20;
  const minCenterX = padLeft + pillW / 2 + 2;
  const maxCenterX = rightEdge - pillW / 2 - 2;
  const cx = Math.max(minCenterX, Math.min(maxCenterX, x));
  const cy = y - 16 < padTop + 2 ? y + 16 : y - 16;
  const fill = toneClass === 'neg' ? 'var(--neg)' : 'var(--pos)';

  return `
    <g pointer-events="none">
      <rect x="${(cx - pillW / 2).toFixed(1)}" y="${(cy - pillH / 2).toFixed(1)}" width="${pillW.toFixed(1)}" height="${pillH}" rx="10" fill="${fill}" />
      <text x="${cx.toFixed(1)}" y="${(cy + 3.8).toFixed(1)}" text-anchor="middle" class="chart-pill-text">${escapeHtml(text)}</text>
    </g>
  `;
}

function renderDefs() {
  return `
    <defs>
      <linearGradient id="tsAreaPos" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--pos)" stop-opacity="0.24" />
        <stop offset="100%" stop-color="var(--pos)" stop-opacity="0.01" />
      </linearGradient>
      <linearGradient id="tsAreaNeg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--neg)" stop-opacity="0.22" />
        <stop offset="100%" stop-color="var(--neg)" stop-opacity="0.01" />
      </linearGradient>
      <linearGradient id="tsBarPos" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--pos)" stop-opacity="1" />
        <stop offset="100%" stop-color="var(--pos)" stop-opacity="0.72" />
      </linearGradient>
      <linearGradient id="tsBarNeg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--neg)" stop-opacity="0.75" />
        <stop offset="100%" stop-color="var(--neg)" stop-opacity="1" />
      </linearGradient>
      <linearGradient id="tsGuideGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.1" />
        <stop offset="50%" stop-color="var(--accent)" stop-opacity="0.5" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.15" />
      </linearGradient>
    </defs>
  `;
}

export function renderSavingsChart({
  transactions,
  mode,
  range,
  selectedIndex,
  containerWidth,
  animateTransition = false,
  onSelectIndex
}) {
  const sortedAsc = sortTransactionsAsc(transactions);
  const { items, baseBalance } = filterByRange(sortedAsc, range);

  let rangeText = 'Belum ada transaksi';
  if (items.length > 0) {
    const firstDate = items[0].date;
    const lastDate = items[items.length - 1].date;
    if (firstDate === lastDate) {
      rangeText = formatDateLongId(firstDate);
    } else {
      rangeText = `${formatDateShortId(firstDate)} – ${formatDateLongId(lastDate)}`;
    }
  }

  if (items.length === 0) {
    return {
      rangeText,
      readoutHtml: `
        <div class="chart-readout-empty">
          <div class="readout-date">Belum ada data pada rentang ini</div>
          <div class="readout-note">Catat tabungan pertamamu untuk melihat grafik naik-turun.</div>
        </div>
      `,
      svgHtml: `
        <div class="chart-empty-state">
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 3v18h18"/><path d="m7 14 4-4 4 3 5-6"/>
          </svg>
          <span>Grafik akan muncul otomatis setelah ada catatan tabungan.</span>
        </div>
      `,
      bindEvents: () => {}
    };
  }

  const W = Math.max(320, Math.min(580, Math.round(containerWidth || 380)));
  const H = 222;
  const padLeft = W < 400 ? 52 : 58;
  const padRight = 16;
  const padTop = 26;
  const padBottom = 42;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const rightEdge = W - padRight;

  if (mode === 'line') {
    let running = baseBalance;
    const points = items.map((tx, idx) => {
      const delta = tx.type === 'deposit' ? tx.amount : -tx.amount;
      running += delta;
      return {
        index: idx,
        tx,
        date: tx.date,
        delta,
        balance: running
      };
    });

    const balances = points.map((p) => p.balance);
    const rawMin = Math.min(0, baseBalance, ...balances);
    const rawMax = Math.max(0, baseBalance, ...balances);

    let minY = rawMin < 0 ? -niceCeil(Math.abs(rawMin)) : 0;
    let maxY = rawMax > 0 ? niceCeil(rawMax) : 10000;
    if (maxY === minY) maxY = minY + 10000;

    const mapX = (i) => {
      if (points.length === 1) return padLeft + plotW / 2;
      return padLeft + (i / (points.length - 1)) * plotW;
    };
    const mapY = (val) => padTop + ((maxY - val) / (maxY - minY)) * plotH;

    points.forEach((p, i) => {
      p.x = mapX(i);
      p.y = mapY(p.balance);
    });

    const activeIdx =
      typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < points.length
        ? selectedIndex
        : points.length - 1;
    const activePt = points[activeIdx];

    const tickCount = 4;
    const yTicks = [];
    for (let i = 0; i <= tickCount; i++) {
      const val = minY + ((maxY - minY) * i) / tickCount;
      yTicks.push({ val, y: mapY(val), label: formatCompactIdr(val) });
    }

    const zeroY = mapY(0);
    const xTicks = buildXAxisTicks(points, W < 380 ? 52 : 58);

    let areaSvg = '';
    let segmentsSvg = '';
    if (points.length === 1) {
      const p0 = points[0];
      const segColor = p0.delta >= 0 ? 'var(--pos)' : 'var(--neg)';
      const gradId = p0.delta >= 0 ? 'tsAreaPos' : 'tsAreaNeg';
      areaSvg += `<rect x="${padLeft}" y="${Math.min(p0.y, zeroY).toFixed(1)}" width="${(p0.x - padLeft).toFixed(1)}" height="${Math.abs(zeroY - p0.y).toFixed(1)}" fill="url(#${gradId})" opacity="0.6" />`;
      segmentsSvg += `<line x1="${padLeft}" y1="${p0.y.toFixed(1)}" x2="${p0.x.toFixed(1)}" y2="${p0.y.toFixed(1)}" stroke="${segColor}" stroke-width="2.5" stroke-dasharray="4 4" opacity="0.6" />`;
    } else {
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const isUp = curr.balance >= prev.balance;
        const color = isUp ? 'var(--pos)' : 'var(--neg)';
        const gradId = isUp ? 'tsAreaPos' : 'tsAreaNeg';
        const polyPts = `${prev.x.toFixed(1)},${zeroY.toFixed(1)} ${prev.x.toFixed(1)},${prev.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${zeroY.toFixed(1)}`;
        areaSvg += `<polygon points="${polyPts}" fill="url(#${gradId})" />`;
        segmentsSvg += `<line x1="${prev.x.toFixed(1)}" y1="${prev.y.toFixed(1)}" x2="${curr.x.toFixed(1)}" y2="${curr.y.toFixed(1)}" stroke="${color}" stroke-width="2.8" stroke-linecap="round" />`;
      }
    }

    const dotsSvg = points
      .map((p) => {
        const isSel = p.index === activeIdx;
        const fill = p.tx.type === 'deposit' ? 'var(--pos)' : 'var(--neg)';
        return `
          <g class="chart-hit" data-idx="${p.index}" style="cursor:pointer;">
            ${isSel ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="11" fill="${fill}" opacity="0.18" />` : ''}
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isSel ? 5.5 : 3.6}" fill="${fill}" stroke="var(--card)" stroke-width="2" />
            <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" fill="transparent" />
          </g>
        `;
      })
      .join('');

    const activeTone = activePt.tx.type === 'deposit' ? 'pos' : 'neg';
    const readoutAmount =
      activePt.tx.type === 'deposit'
        ? `<span class="readout-badge pos">Nabung +${formatRupiah(activePt.tx.amount)}</span>`
        : `<span class="readout-badge neg">Ambil -${formatRupiah(activePt.tx.amount)}</span>`;
    const noteText = activePt.tx.note ? escapeHtml(activePt.tx.note) : '<span class="muted">Tanpa catatan</span>';

    const readoutHtml = `
      <div class="chart-readout tone-${activeTone}">
        <div class="readout-top">
          <span class="readout-date">${escapeHtml(formatRelativeDayLabel(activePt.tx.date))}</span>
          <span class="readout-balance">Saldo: <strong>${escapeHtml(formatRupiah(activePt.balance))}</strong></span>
        </div>
        <div class="readout-mid">
          ${readoutAmount}
          <span class="readout-note">${noteText}</span>
        </div>
      </div>
    `;

    const pillSvg = renderValuePill(
      activePt.x,
      activePt.y,
      formatCompactIdr(activePt.balance),
      activePt.balance >= 0 ? 'pos' : 'neg',
      padLeft,
      rightEdge,
      padTop
    );

    const svgClass = animateTransition ? 'chart-svg chart-svg-enter' : 'chart-svg';
    const svgHtml = `
      <svg class="${svgClass}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik garis saldo tabungan">
        ${renderDefs()}
        ${xTicks
          .map(
            (xt) => `
          <line x1="${xt.x.toFixed(1)}" y1="${padTop}" x2="${xt.x.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="var(--border)" stroke-width="0.65" stroke-dasharray="2 4" opacity="0.32" />
        `
          )
          .join('')}
        ${yTicks
          .map(
            (t) => `
          <line x1="${padLeft}" y1="${t.y.toFixed(1)}" x2="${rightEdge}" y2="${t.y.toFixed(1)}" stroke="var(--border)" stroke-width="${t.val === 0 ? '0.9' : '0.65'}" stroke-dasharray="${t.val === 0 ? 'none' : '2 4'}" opacity="${t.val === 0 ? '0.7' : '0.45'}" />
          <text x="${padLeft - 8}" y="${(t.y + 3.5).toFixed(1)}" text-anchor="end" class="chart-axis-y">${escapeHtml(t.label)}</text>
        `
          )
          .join('')}
        ${minY < 0 && maxY > 0 ? `<line x1="${padLeft}" y1="${zeroY.toFixed(1)}" x2="${rightEdge}" y2="${zeroY.toFixed(1)}" stroke="var(--text-muted)" stroke-width="0.9" opacity="0.4" />` : ''}
        <line x1="${activePt.x.toFixed(1)}" y1="${padTop}" x2="${activePt.x.toFixed(1)}" y2="${padTop + plotH}" stroke="url(#tsGuideGrad)" stroke-width="1.4" />
        ${areaSvg}
        ${segmentsSvg}
        ${dotsSvg}
        ${pillSvg}
        ${xTicks
          .map(
            (xt) => `
          <text x="${xt.x.toFixed(1)}" y="${H - 20}" text-anchor="middle" class="chart-axis-x-day">${escapeHtml(xt.dayLabel)}</text>
          <text x="${xt.x.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart-axis-x-date">${escapeHtml(xt.dateLabel)}</text>
        `
          )
          .join('')}
      </svg>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-dot pos"></span>Naik / Masuk</span>
        <span class="legend-item"><span class="legend-dot neg"></span>Turun / Ambil</span>
        <span class="legend-hint">Ketuk titik untuk detail</span>
      </div>
    `;

    return {
      rangeText,
      readoutHtml,
      svgHtml,
      bindEvents: (rootEl) => {
        rootEl.querySelectorAll('.chart-hit').forEach((el) => {
          el.addEventListener('click', () => {
            const idx = Number(el.getAttribute('data-idx'));
            if (!Number.isNaN(idx)) onSelectIndex(idx);
          });
        });
      }
    };
  }

  // BAR MODE: Daily Masuk / Keluar from zero line
  const dayMap = new Map();
  for (const tx of items) {
    if (!dayMap.has(tx.date)) {
      dayMap.set(tx.date, { date: tx.date, deposit: 0, withdraw: 0, notes: [] });
    }
    const entry = dayMap.get(tx.date);
    if (tx.type === 'deposit') entry.deposit += tx.amount;
    else entry.withdraw += tx.amount;
    if (tx.note) entry.notes.push(tx.note);
  }
  const days = Array.from(dayMap.values());
  const maxDeposit = Math.max(0, ...days.map((d) => d.deposit));
  const maxWithdraw = Math.max(0, ...days.map((d) => d.withdraw));

  const topMax = maxDeposit > 0 ? niceCeil(maxDeposit) : (maxWithdraw > 0 ? 0 : 10000);
  const botMax = maxWithdraw > 0 ? niceCeil(maxWithdraw) : 0;
  const totalSpan = topMax + botMax || 10000;

  const mapY = (val) => padTop + ((topMax - val) / totalSpan) * plotH;
  const zeroY = mapY(0);

  const slotW = plotW / days.length;
  const barW = Math.min(28, Math.max(10, slotW * 0.56));

  days.forEach((d, i) => {
    d.index = i;
    d.x = padLeft + slotW * i + slotW / 2;
    d.net = d.deposit - d.withdraw;
  });

  const activeIdx =
    typeof selectedIndex === 'number' && selectedIndex >= 0 && selectedIndex < days.length
      ? selectedIndex
      : days.length - 1;
  const activeDay = days[activeIdx];

  const yTickVals = new Set([0]);
  if (topMax > 0) {
    yTickVals.add(topMax);
    yTickVals.add(topMax / 2);
  }
  if (botMax > 0) {
    yTickVals.add(-botMax);
    yTickVals.add(-botMax / 2);
  }
  const yTicks = Array.from(yTickVals)
    .sort((a, b) => a - b)
    .map((val) => ({ val, y: mapY(val), label: formatCompactIdr(val) }));

  const xTicks = buildXAxisTicks(days, W < 380 ? 52 : 58);

  const barsSvg = days
    .map((d, i) => {
      const isSel = d.index === activeIdx;
      const bx = d.x - barW / 2;
      const upY = mapY(d.deposit);
      const upH = Math.max(0, zeroY - upY - 1);
      const dnY = zeroY + 1;
      const dnH = Math.max(0, mapY(-d.withdraw) - zeroY - 1);
      const hitX = padLeft + slotW * d.index;
      const delayMs = Math.min(i * 18, 160);
      const transStyle = animateTransition ? `transition-delay:${delayMs}ms;` : '';
      const upCls = animateTransition ? 'chart-bar-rect chart-bar-up is-entering' : 'chart-bar-rect chart-bar-up';
      const dnCls = animateTransition ? 'chart-bar-rect chart-bar-down is-entering' : 'chart-bar-rect chart-bar-down';

      return `
        <g class="chart-hit" data-idx="${d.index}" style="cursor:pointer;">
          ${isSel ? `<rect x="${(d.x - barW / 2 - 5).toFixed(1)}" y="${padTop}" width="${(barW + 10).toFixed(1)}" height="${plotH}" rx="8" fill="var(--accent)" opacity="0.09" />` : ''}
          ${d.deposit > 0 ? `<rect class="${upCls}" style="${transStyle}" x="${bx.toFixed(1)}" y="${upY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(3, upH).toFixed(1)}" rx="5" fill="url(#tsBarPos)" opacity="${isSel ? '1' : '0.82'}" />` : ''}
          ${d.withdraw > 0 ? `<rect class="${dnCls}" style="${transStyle}" x="${bx.toFixed(1)}" y="${dnY.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(3, dnH).toFixed(1)}" rx="5" fill="url(#tsBarNeg)" opacity="${isSel ? '1' : '0.82'}" />` : ''}
          <rect x="${hitX.toFixed(1)}" y="${padTop}" width="${slotW.toFixed(1)}" height="${plotH}" fill="transparent" />
        </g>
      `;
    })
    .join('');

  const netLabel = formatRupiahSigned(activeDay.net);
  const netClass = activeDay.net >= 0 ? 'pos' : 'neg';
  const noteSummary =
    activeDay.notes.length > 0
      ? escapeHtml(activeDay.notes.slice(0, 2).join(' • '))
      : '<span class="muted">Tanpa catatan pada tanggal ini</span>';

  const parts = [];
  if (activeDay.deposit > 0) parts.push(`<span class="readout-badge pos">Masuk +${formatRupiah(activeDay.deposit)}</span>`);
  if (activeDay.withdraw > 0) parts.push(`<span class="readout-badge neg">Ambil -${formatRupiah(activeDay.withdraw)}</span>`);

  const readoutHtml = `
    <div class="chart-readout tone-${netClass}">
      <div class="readout-top">
        <span class="readout-date">${escapeHtml(formatRelativeDayLabel(activeDay.date))}</span>
        <span class="readout-balance">Selisih: <strong class="${netClass}">${escapeHtml(netLabel)}</strong></span>
      </div>
      <div class="readout-mid">
        <div class="readout-badges">${parts.join('')}</div>
        <span class="readout-note">${noteSummary}</span>
      </div>
    </div>
  `;

  const topBarY = activeDay.deposit > 0 ? mapY(activeDay.deposit) : mapY(-activeDay.withdraw);
  const barPillSvg = renderValuePill(
    activeDay.x,
    topBarY,
    (activeDay.net > 0 ? '+' : '') + formatCompactIdr(activeDay.net),
    netClass,
    padLeft,
    rightEdge,
    padTop
  );

  const barSvgClass = animateTransition ? 'chart-svg chart-svg-enter' : 'chart-svg';
  const svgHtml = `
    <svg class="${barSvgClass}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik batang masuk keluar harian">
      ${renderDefs()}
      ${xTicks
        .map(
          (xt) => `
        <line x1="${xt.x.toFixed(1)}" y1="${padTop}" x2="${xt.x.toFixed(1)}" y2="${(padTop + plotH).toFixed(1)}" stroke="var(--border)" stroke-width="0.65" stroke-dasharray="2 4" opacity="0.32" />
      `
        )
        .join('')}
      ${yTicks
        .map(
          (t) => `
        <line x1="${padLeft}" y1="${t.y.toFixed(1)}" x2="${rightEdge}" y2="${t.y.toFixed(1)}" stroke="${t.val === 0 ? 'var(--text-muted)' : 'var(--border)'}" stroke-width="${t.val === 0 ? '0.95' : '0.65'}" stroke-dasharray="${t.val === 0 ? 'none' : '2 4'}" opacity="${t.val === 0 ? '0.48' : '0.45'}" />
        <text x="${padLeft - 8}" y="${(t.y + 3.5).toFixed(1)}" text-anchor="end" class="chart-axis-y">${escapeHtml(t.label)}</text>
      `
        )
        .join('')}
      ${barsSvg}
      ${barPillSvg}
      ${xTicks
        .map(
          (xt) => `
        <text x="${xt.x.toFixed(1)}" y="${H - 20}" text-anchor="middle" class="chart-axis-x-day">${escapeHtml(xt.dayLabel)}</text>
        <text x="${xt.x.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="chart-axis-x-date">${escapeHtml(xt.dateLabel)}</text>
      `
        )
        .join('')}
    </svg>
    <div class="chart-legend">
      <span class="legend-item"><span class="legend-dot pos"></span>Masuk</span>
      <span class="legend-item"><span class="legend-dot neg"></span>Ambil</span>
      <span class="legend-hint">Ketuk batang untuk detail</span>
    </div>
  `;

  return {
    rangeText,
    readoutHtml,
    svgHtml,
    bindEvents: (rootEl) => {
      const enteringBars = rootEl.querySelectorAll('.chart-bar-rect.is-entering');
      if (enteringBars.length > 0 && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            enteringBars.forEach((bar) => bar.classList.remove('is-entering'));
          });
        });
      }
      rootEl.querySelectorAll('.chart-hit').forEach((el) => {
        el.addEventListener('click', () => {
          const idx = Number(el.getAttribute('data-idx'));
          if (!Number.isNaN(idx)) onSelectIndex(idx);
        });
      });
    }
  };
}
