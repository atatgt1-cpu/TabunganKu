function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(?:function|const|let|var|class)\b)/gm, '');
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca aset gambar.'));
    reader.readAsDataURL(blob);
  });
}

async function safeFetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal memuat ${url}`);
  return res.text();
}

export async function buildStandaloneOfflineHtml() {
  const [cssRaw, iconSvg, formatJs, storageJs, chartJs, appJs, heroBlob] = await Promise.all([
    safeFetchText('./css/styles.css'),
    safeFetchText('./icons/icon.svg'),
    safeFetchText('./js/format.js'),
    safeFetchText('./js/storage.js'),
    safeFetchText('./js/chart.js'),
    safeFetchText('./js/app.js'),
    fetch('./img/piggy-hero.jpg').then((r) => (r.ok ? r.blob() : null)).catch(() => null)
  ]);

  let heroDataUrl = '';
  if (heroBlob) {
    heroDataUrl = await blobToDataUrl(heroBlob);
  }

  const iconDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(iconSvg)}`;

  // Strip @font-face relative URLs in standalone single-file HTML so no broken local paths occur
  const cleanCss = cssRaw.replace(/@font-face\s*\{[\s\S]*?\}\s*/g, '');

  // Prepare app markup by cloning current #app-root outerHTML or building from template
  const htmlClone = document.documentElement.cloneNode(true);
  // Remove module scripts, manifest, and external stylesheet links in clone
  htmlClone.querySelectorAll('link[rel="stylesheet"], link[rel="manifest"], link[rel="apple-touch-icon"], script[type="module"]').forEach((el) => el.remove());

  // Set inline favicon
  let iconLink = htmlClone.querySelector('link[rel="icon"]');
  if (iconLink) {
    iconLink.setAttribute('href', iconDataUrl);
  }

  // Embed base64 hero image & SVG brand mark inside markup
  const heroImg = htmlClone.querySelector('#welcome-hero-img');
  if (heroImg && heroDataUrl) {
    heroImg.setAttribute('src', heroDataUrl);
  }
  const brandImg = htmlClone.querySelector('.brand-mark');
  if (brandImg) {
    brandImg.setAttribute('src', iconDataUrl);
  }

  // Reset active tab and nav to Beranda for clean initial open
  htmlClone.querySelectorAll('.page-section').forEach((sec) => {
    sec.classList.toggle('active', sec.id === 'page-beranda');
  });
  htmlClone.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-nav') === 'beranda');
  });
  htmlClone.querySelectorAll('.sheet-backdrop.open').forEach((m) => m.classList.remove('open'));
  const toastEl = htmlClone.querySelector('#app-toast');
  if (toastEl) toastEl.classList.remove('show');

  // Clear dynamic list containers so script boots cleanly from localStorage
  ['recent-tx-list', 'history-tx-list', 'chart-readout-slot', 'chart-svg-slot', 'goal-summary-body', 'goal-detail-card', 'restore-preview-slot'].forEach((id) => {
    const el = htmlClone.querySelector(`#${id}`);
    if (el) el.innerHTML = '';
  });

  const bundledScript = `
(function() {
  window.__TABUNGAN_STANDALONE__ = true;
  ${heroDataUrl ? `window.__TABUNGAN_HERO_SRC__ = ${JSON.stringify(heroDataUrl)};` : ''}
  ${stripModuleSyntax(formatJs)}
  ${stripModuleSyntax(storageJs)}
  ${stripModuleSyntax(chartJs)}
  ${stripModuleSyntax(appJs.replace(/export\s*\{[\s\S]*?\};?/g, ''))}
})();
`;

  const head = htmlClone.querySelector('head');
  const styleEl = document.createElement('style');
  styleEl.textContent = cleanCss;
  head.appendChild(styleEl);

  const body = htmlClone.querySelector('body');
  const scriptEl = document.createElement('script');
  scriptEl.textContent = bundledScript.replace(/<\/script>/gi, '<\\/script>');
  body.appendChild(scriptEl);

  return '<!DOCTYPE html>\n' + htmlClone.outerHTML;
}
