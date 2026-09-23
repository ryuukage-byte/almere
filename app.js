/**
 * Almere & Co — Interactive Application Logic
 * Implements Currency Switching, High-DPI Historical Portfolio Line Chart,
 * Donut Allocation Interactivity, Real-time Sync Telemetry, and Modals.
 */

(function () {
  'use strict';

  // --- 1. DATA & STATE ---
  let BASE_HOLDINGS = {};
  let currentHoldings = [];
  let BASE_TOTAL_USD = 0;
  let REALIZED_PNL_USD = 0;
  let REALIZED_PNL_IDR = 0;

  const ASSET_THEMES = {
    HYPE: { icon: 'H', color: '#38ef7d', name: 'Hyperliquid' },
    BTC: { icon: '₿', color: '#ffffff', name: 'Bitcoin' },
    ETH: { icon: 'Ξ', color: '#cbd5e1', name: 'Ethereum' },
    SOL: { icon: '◎', color: '#94a3b8', name: 'Solana' },
    CASH: { icon: '$', color: '#64748b', name: 'Kas Tunai' },
    IDR: { icon: 'Rp', color: '#64748b', name: 'Kas Tunai' },
    USDC: { icon: '$', color: '#94a3b8', name: 'USDC' }
  };

  function getAssetTheme(code) {
    const c = (code || '').toUpperCase();
    return ASSET_THEMES[c] || {
      icon: c.charAt(0) || '◆',
      color: '#cbd5e1',
      name: c
    };
  }

  // Supported Currencies: Pure 1:1 Native Parity between USD and IDR
  const CURRENCIES = {
    USD: { symbol: '$', rate: 1.0, locale: 'en-US', digits: 0, name: 'Dolar AS' },
    IDR: { symbol: 'Rp ', rate: 17818, locale: 'id-ID', digits: 0, name: 'Rupiah Indonesia' }
  };

  let activeCurrencyCode = 'USD';
  let activeTimeRange = '30D';

  // --- 2. FORMATTING & ODOMETER EASING ENGINE ---
  // The motion is JS (requestAnimationFrame easing), the type
  // treatment keeps digits from shifting width as they change.
  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function formatValue(usdAmount, currencyCode = activeCurrencyCode) {
    const config = CURRENCIES[currencyCode] || CURRENCIES.USD;
    const converted = usdAmount * config.rate;
    
    // Formatting with thousands separator
    const formatted = Math.round(converted).toLocaleString(config.locale, {
      maximumFractionDigits: config.digits,
      minimumFractionDigits: config.digits
    });

    return {
      symbol: config.symbol,
      numberStr: formatted,
      fullText: `${config.symbol}${formatted}`,
      numericValue: Math.round(converted)
    };
  }

  /**
   * Animates a numerical element using requestAnimationFrame and easeOutExpo.
   * Tabular-nums keeps character width from shifting during rolling numbers.
   */
  function animateOdometer(element, targetNum, config, options = {}) {
    if (!element) return;
    const includeSymbol = options.includeSymbol || false;
    const duration = options.duration || 850;

    if (element._odometerAnimId) {
      cancelAnimationFrame(element._odometerAnimId);
      element._odometerAnimId = null;
    }

    // Determine starting number: 0 on initial load, or previous converted value
    const startNum = typeof element._odometerCurrentVal === 'number' ? element._odometerCurrentVal : 0;
    const delta = targetNum - startNum;
    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);
      const currentNum = Math.round(startNum + delta * easedProgress);

      element._odometerCurrentVal = currentNum;

      const formatted = currentNum.toLocaleString(config.locale, {
        maximumFractionDigits: config.digits,
        minimumFractionDigits: config.digits
      });

      element.textContent = includeSymbol ? `${config.symbol}${formatted}` : formatted;

      if (progress < 1) {
        element._odometerAnimId = requestAnimationFrame(tick);
      } else {
        element._odometerCurrentVal = targetNum;
        const finalFormatted = targetNum.toLocaleString(config.locale, {
          maximumFractionDigits: config.digits,
          minimumFractionDigits: config.digits
        });
        element.textContent = includeSymbol ? `${config.symbol}${finalFormatted}` : finalFormatted;
        element._odometerAnimId = null;
      }
    }

    element._odometerAnimId = requestAnimationFrame(tick);
  }

  // --- 3. DOM ELEMENTS ---
  const mainSymbolEl = document.getElementById('main-curr-symbol');
  const totalValEl = document.getElementById('portfolio-total-val');
  const holdingValElements = document.querySelectorAll('.asset-converted-val');
  const activeCurrencyLabels = document.querySelectorAll('.active-currency-label');
  const chartStartValEl = document.getElementById('chart-start-val');
  const chartCurrentValEl = document.getElementById('chart-current-val');
  const chartGrowthValEl = document.getElementById('chart-growth-val');
  const timeTabs = document.querySelectorAll('.time-tab');

  // Currency Dropdown DOM Elements
  const currencyDropdownWrap = document.getElementById('currency-dropdown-wrap');
  const currencyDropdownTrigger = document.getElementById('currency-dropdown-trigger');
  const currencyTriggerVal = document.getElementById('currency-trigger-val');
  const currencyDropdownPopover = document.getElementById('currency-dropdown-popover');
  const currencySearchInputField = document.getElementById('currency-search-input-field');
  const clearCurrencySearchBtn = document.getElementById('clear-currency-search');
  const currencyListVertical = document.getElementById('currency-list-vertical');

  // --- 4. CURRENCY SWITCHING LOGIC ---
  function updateCurrencyUI(newCode, isInitial = false) {
    if (liveCryptoPrices && liveCryptoPrices.USD_IDR > 0) {
      CURRENCIES.IDR.rate = liveCryptoPrices.USD_IDR;
    }
    if (!CURRENCIES[newCode]) return;
    activeCurrencyCode = newCode;
    const config = CURRENCIES[newCode];

    // Update dropdown trigger label
    if (currencyTriggerVal) {
      currencyTriggerVal.textContent = `${newCode} (${config.symbol.trim()})`;
    }

    // Direct 1:1 total calculation without double-conversion rounding
    let targetTotal = 0;
    if (newCode === 'IDR') {
      targetTotal = currentHoldings.reduce((sum, h) => sum + (h.valueIdr || 0), 0);
      if (targetTotal === 0 && BASE_TOTAL_USD > 0) {
        targetTotal = Math.round(BASE_TOTAL_USD * config.rate);
      }
    } else if (newCode === 'USD') {
      targetTotal = currentHoldings.reduce((sum, h) => sum + (h.valueUsd || 0), 0);
      if (targetTotal === 0 && BASE_TOTAL_USD > 0) {
        targetTotal = BASE_TOTAL_USD;
      }
    } else {
      targetTotal = Math.round(BASE_TOTAL_USD * config.rate);
    }

    if (mainSymbolEl) mainSymbolEl.textContent = config.symbol;
    animateOdometer(totalValEl, targetTotal, config, {
      includeSymbol: false,
      duration: isInitial ? 1000 : 800
    });

    // Update holding rows with direct native valuation (1:1 precision)
    const dynamicHoldingValEls = document.querySelectorAll('.asset-converted-val');
    dynamicHoldingValEls.forEach(el => {
      const code = el.getAttribute('data-asset-code');
      const holding = currentHoldings.find(h => h.code === code);
      let targetHolding = 0;
      if (newCode === 'IDR' && holding && typeof holding.valueIdr === 'number') {
        targetHolding = holding.valueIdr;
      } else if (newCode === 'USD' && holding && typeof holding.valueUsd === 'number') {
        targetHolding = holding.valueUsd;
      } else {
        const baseUsd = (holding && typeof holding.valueUsd === 'number')
          ? holding.valueUsd
          : (parseFloat(el.getAttribute('data-base-usd')) || 0);
        targetHolding = Math.round(baseUsd * config.rate);
      }
      animateOdometer(el, targetHolding, config, {
        includeSymbol: true,
        duration: isInitial ? 1000 : 800
      });
    });

    // Update active currency text labels
    activeCurrencyLabels.forEach(el => {
      el.textContent = newCode;
    });

    // Highlight selected item in vertical currency list
    if (currencyListVertical) {
      const allRows = currencyListVertical.querySelectorAll('.currency-item-row');
      allRows.forEach(row => {
        row.classList.toggle('selected', row.getAttribute('data-currency') === newCode);
      });
    }

    // Refresh chart figures with current currency
    renderHistoricalChart();

    // Refresh transaction history figures with current currency
    if (typeof renderTransactions === 'function') {
      renderTransactions(activeTxFilter);
    }
  }

  // Populate Vertical Currency List (Nge-baris ke bawah & Searchable)
  function populateVerticalCurrencyList(filter = '') {
    if (!currencyListVertical) return;
    currencyListVertical.innerHTML = '';

    const filterLower = filter.toLowerCase().trim();
    const codes = Object.keys(CURRENCIES);
    let matchCount = 0;

    codes.forEach(code => {
      const curr = CURRENCIES[code];
      const matches = code.toLowerCase().includes(filterLower) ||
                      curr.name.toLowerCase().includes(filterLower) ||
                      curr.symbol.toLowerCase().includes(filterLower);

      if (matches) {
        matchCount++;
        const item = document.createElement('div');
        item.className = `currency-item-row ${code === activeCurrencyCode ? 'selected' : ''}`;
        item.setAttribute('data-currency', code);
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', code === activeCurrencyCode ? 'true' : 'false');
        item.innerHTML = `
          <div class="currency-item-left">
            <span class="currency-item-code">${code}</span>
            <span class="currency-item-name">${curr.name}</span>
          </div>
          <div class="currency-item-right">
            <span class="currency-item-symbol">${curr.symbol.trim()}</span>
            <span class="currency-item-check">✓</span>
          </div>
        `;

        item.addEventListener('click', () => {
          updateCurrencyUI(code);
          closeCurrencyDropdown();
        });

        currencyListVertical.appendChild(item);
      }
    });

    if (matchCount === 0) {
      const empty = document.createElement('div');
      empty.className = 'currency-empty-state';
      empty.textContent = `Mata uang "${filter}" tidak ditemukan`;
      currencyListVertical.appendChild(empty);
    }
  }

  function openCurrencyDropdown() {
    if (!currencyDropdownPopover || !currencyDropdownTrigger) return;
    currencyDropdownTrigger.classList.add('open');
    currencyDropdownTrigger.setAttribute('aria-expanded', 'true');
    currencyDropdownPopover.classList.add('show');
    if (currencySearchInputField) {
      currencySearchInputField.value = '';
      if (clearCurrencySearchBtn) clearCurrencySearchBtn.style.display = 'none';
      populateVerticalCurrencyList('');
      setTimeout(() => currencySearchInputField.focus(), 60);
    }
  }

  function closeCurrencyDropdown() {
    if (!currencyDropdownPopover || !currencyDropdownTrigger) return;
    currencyDropdownTrigger.classList.remove('open');
    currencyDropdownTrigger.setAttribute('aria-expanded', 'false');
    currencyDropdownPopover.classList.remove('show');
  }

  if (currencyDropdownTrigger) {
    currencyDropdownTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currencyDropdownPopover && currencyDropdownPopover.classList.contains('show')) {
        closeCurrencyDropdown();
      } else {
        openCurrencyDropdown();
      }
    });
  }

  if (currencySearchInputField) {
    currencySearchInputField.addEventListener('input', (e) => {
      const query = e.target.value;
      if (clearCurrencySearchBtn) {
        clearCurrencySearchBtn.style.display = query ? 'block' : 'none';
      }
      populateVerticalCurrencyList(query);
    });

    currencySearchInputField.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (clearCurrencySearchBtn) {
    clearCurrencySearchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currencySearchInputField) {
        currencySearchInputField.value = '';
        clearCurrencySearchBtn.style.display = 'none';
        populateVerticalCurrencyList('');
        currencySearchInputField.focus();
      }
    });
  }

  // Prevent clicks inside the dropdown popover from closing it prematurely
  if (currencyDropdownPopover) {
    currencyDropdownPopover.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (currencyDropdownWrap && !currencyDropdownWrap.contains(e.target)) {
      closeCurrencyDropdown();
    }
  });

  // --- 5. HISTORICAL CHART GENERATION & RENDERING ---
  const canvas = document.getElementById('portfolioChart');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const chartTooltip = document.getElementById('chartTooltip');

  // Base Historical Datasets (normalized in USD)
  const HISTORICAL_PROFILES = {
    '7D': {
      days: 7,
      growthPct: 3.2,
      dataPoints: [180600, 181200, 182900, 182100, 184500, 185800, 186420],
      labels: ['6 Hari lalu', '5 Hari lalu', '4 Hari lalu', '3 Hari lalu', '2 Hari lalu', 'Kemarin', 'Hari ini']
    },
    '30D': {
      days: 30,
      growthPct: 12.8,
      dataPoints: [
        165240, 166100, 164800, 167300, 168900, 168200, 170400,
        171200, 169800, 172600, 174500, 173900, 175800, 177200,
        176400, 178100, 179500, 178900, 180400, 182100, 181500,
        183400, 184200, 183600, 185100, 185900, 184900, 186100, 185800, 186420
      ],
      labels: Array.from({ length: 30 }, (_, i) => `${30 - i}H lalu`)
    },
    '90D': {
      days: 90,
      growthPct: 24.6,
      dataPoints: [
        149600, 151200, 153400, 152100, 155800, 157200, 156400, 159100,
        161500, 160200, 163400, 165800, 167200, 169400, 172800, 175100,
        174200, 177900, 180400, 182800, 184200, 186420
      ],
      labels: Array.from({ length: 22 }, (_, i) => `W${i + 1}`)
    },
    '1Y': {
      days: 365,
      growthPct: 92.4,
      dataPoints: [
        96800, 102400, 108900, 114200, 118700, 126400, 131800, 142100,
        148900, 156400, 168200, 178900, 186420
      ],
      labels: ['Okt 25', 'Nov', 'Des', 'Jan 26', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep 26', 'Hari ini']
    }
  };

  let chartPointsCache = [];

  function renderHistoricalChart() {
    if (!canvas || !ctx) return;

    if (BASE_TOTAL_USD === 0) {
      const zeroFmt = formatValue(0);
      if (chartStartValEl) chartStartValEl.textContent = zeroFmt.fullText;
      if (chartCurrentValEl) chartCurrentValEl.textContent = zeroFmt.fullText;
      if (chartGrowthValEl) chartGrowthValEl.textContent = `0.0% (${zeroFmt.fullText})`;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || rect.width <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const padBottom = 40;
      const padLeft = 20;
      const padRight = 20;
      const yZero = height - padBottom;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(padLeft, yZero);
      ctx.lineTo(width - padRight, yZero);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Belum ada transaksi historis di ledger (Saldo 0)', width / 2, height / 2);
      chartPointsCache = [];
      return;
    }

    const profile = HISTORICAL_PROFILES[activeTimeRange] || HISTORICAL_PROFILES['30D'];
    const scale = BASE_TOTAL_USD / 186420;
    const rawData = profile.dataPoints.map((p, idx) => {
      if (idx === profile.dataPoints.length - 1) return BASE_TOTAL_USD;
      return Math.max(1, Math.round(p * scale));
    });
    const startUsd = rawData[0];
    const currentUsd = rawData[rawData.length - 1];
    const diffUsd = currentUsd - startUsd;

    // Update meta bar figures
    const startFmt = formatValue(startUsd);
    const currFmt = formatValue(currentUsd);
    const diffFmt = formatValue(diffUsd);

    if (chartStartValEl) chartStartValEl.textContent = startFmt.fullText;
    if (chartCurrentValEl) chartCurrentValEl.textContent = currFmt.fullText;
    if (chartGrowthValEl) {
      chartGrowthValEl.textContent = `+${profile.growthPct}% (+${diffFmt.fullText})`;
    }

    // High DPI Canvas Scaling
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || rect.width <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    // Layout Padding
    const padTop = 30;
    const padBottom = 40;
    const padLeft = 20;
    const padRight = 20;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Min & Max calculations
    const minVal = Math.min(...rawData) * 0.98;
    const maxVal = Math.max(...rawData) * 1.02;
    const range = Math.max(1, maxVal - minVal);

    // Compute pixel points
    chartPointsCache = rawData.map((val, idx) => {
      const x = padLeft + (idx / (rawData.length - 1)) * plotW;
      const y = padTop + plotH - ((val - minVal) / range) * plotH;
      return { x, y, val, label: profile.labels[idx] || '' };
    });

    // 1. Draw subtle horizontal grid lines (strict monochrome)
    const gridCount = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    for (let i = 0; i <= gridCount; i++) {
      const gy = padTop + (plotH / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(width - padRight, gy);
      ctx.stroke();

      // Faint value text on the side
      const gVal = maxVal - (range / gridCount) * i;
      const gFmt = formatValue(gVal);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(gFmt.fullText, width - padRight, gy - 6);
    }
    ctx.setLineDash([]); // Reset line dash

    // 2. Draw Area Gradient under the curve
    if (chartPointsCache.length > 1) {
      const grad = ctx.createLinearGradient(0, padTop, 0, height - padBottom);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
      grad.addColorStop(0.65, 'rgba(255, 255, 255, 0.03)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0.00)');

      ctx.beginPath();
      ctx.moveTo(chartPointsCache[0].x, height - padBottom);
      ctx.lineTo(chartPointsCache[0].x, chartPointsCache[0].y);

      // Smooth Bézier spline curve
      for (let i = 0; i < chartPointsCache.length - 1; i++) {
        const p0 = chartPointsCache[i];
        const p1 = chartPointsCache[i + 1];
        const midX = (p0.x + p1.x) / 2;
        ctx.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
      }

      ctx.lineTo(chartPointsCache[chartPointsCache.length - 1].x, height - padBottom);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 3. Draw the Curve Line itself
      ctx.beginPath();
      ctx.moveTo(chartPointsCache[0].x, chartPointsCache[0].y);

      for (let i = 0; i < chartPointsCache.length - 1; i++) {
        const p0 = chartPointsCache[i];
        const p1 = chartPointsCache[i + 1];
        const midX = (p0.x + p1.x) / 2;
        ctx.bezierCurveTo(midX, p0.y, midX, p1.y, p1.x, p1.y);
      }

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      // 4. Subtle endpoints accent
      const lastPoint = chartPointsCache[chartPointsCache.length - 1];
      ctx.beginPath();
      ctx.arc(lastPoint.x, lastPoint.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  // Handle Timeframe switching
  timeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      timeTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeTimeRange = tab.getAttribute('data-range');
      renderHistoricalChart();
    });
  });

  // Interactive Chart Tooltip on Hover / Touch
  if (canvas) {
    function handlePointerMove(e) {
      if (!chartPointsCache || chartPointsCache.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
      const mouseX = clientX - rect.left;

      // Find closest point by X coordinate
      let closest = chartPointsCache[0];
      let minDistance = Infinity;

      chartPointsCache.forEach(pt => {
        const dist = Math.abs(pt.x - mouseX);
        if (dist < minDistance) {
          minDistance = dist;
          closest = pt;
        }
      });

      if (closest && minDistance < 60) {
        const fmt = formatValue(closest.val);
        chartTooltip.innerHTML = `
          <div class="chart-tooltip-date">${closest.label || 'Snapshot'}</div>
          <div class="chart-tooltip-val">${fmt.fullText}</div>
        `;
        chartTooltip.style.left = `${closest.x}px`;
        chartTooltip.style.top = `${closest.y}px`;
        chartTooltip.style.opacity = '1';
      } else {
        chartTooltip.style.opacity = '0';
      }
    }

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mouseleave', () => {
      if (chartTooltip) chartTooltip.style.opacity = '0';
    });

    canvas.addEventListener('touchmove', handlePointerMove, { passive: true });
    canvas.addEventListener('touchend', () => {
      if (chartTooltip) chartTooltip.style.opacity = '0';
    });
  }

  // Resize observer to re-render chart accurately on window resize
  const resizeObserver = new ResizeObserver(() => {
    window.requestAnimationFrame(() => {
      renderHistoricalChart();
    });
  });
  if (canvas) resizeObserver.observe(canvas);

  // --- 6. DONUT ALLOCATION HOVER INTERACTIONS ---
  function bindAllocationInteractions() {
    const donutSegments = document.querySelectorAll('.donut-segment');
    const legendItems = document.querySelectorAll('.legend-item');

    donutSegments.forEach(seg => {
      seg.addEventListener('mouseenter', () => {
        const target = seg.getAttribute('data-target');
        highlightAssetByTarget(target);
      });
      seg.addEventListener('mouseleave', resetHighlight);
    });

    legendItems.forEach(item => {
      item.addEventListener('mouseenter', () => {
        const target = item.getAttribute('data-target');
        highlightAssetByTarget(target);
      });
      item.addEventListener('mouseleave', resetHighlight);
    });
  }

  function highlightAssetByTarget(targetKey) {
    const legendItems = document.querySelectorAll('.legend-item');
    const donutSegments = document.querySelectorAll('.donut-segment');

    legendItems.forEach(it => {
      const match = it.getAttribute('data-target') === targetKey;
      it.style.borderColor = match ? 'rgba(255, 255, 255, 0.35)' : '';
      it.style.background = match ? 'rgba(255, 255, 255, 0.07)' : '';
      it.style.opacity = match ? '1' : '0.4';
    });

    donutSegments.forEach(seg => {
      const match = seg.getAttribute('data-target') === targetKey;
      seg.style.opacity = match ? '1' : '0.35';
      seg.style.strokeWidth = match ? '22px' : '18px';
    });
  }

  function resetHighlight() {
    const legendItems = document.querySelectorAll('.legend-item');
    const donutSegments = document.querySelectorAll('.donut-segment');

    legendItems.forEach(it => {
      it.style.borderColor = '';
      it.style.background = '';
      it.style.opacity = '1';
    });

    donutSegments.forEach(seg => {
      seg.style.opacity = '1';
      seg.style.strokeWidth = '18px';
    });
  }

  // --- 7. ASSET VIEW TABS (Holdings, Distribution, Transactions, History) ---
  const assetTabs = document.querySelectorAll('.asset-view-tab');
  const assetPanes = document.querySelectorAll('.asset-tab-pane');

  function switchAssetTab(tabKey) {
    assetTabs.forEach(tab => {
      const isTarget = tab.getAttribute('data-tab') === tabKey;
      tab.classList.toggle('active', isTarget);
      tab.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    assetPanes.forEach(pane => {
      const isTarget = pane.id === `pane-${tabKey}`;
      pane.classList.toggle('active', isTarget);
      if (isTarget) {
        pane.removeAttribute('hidden');
      } else {
        pane.setAttribute('hidden', '');
      }
    });

    if (tabKey === 'history') {
      window.requestAnimationFrame(() => {
        renderHistoricalChart();
      });
    } else if (tabKey === 'transactions') {
      renderTransactions(activeTxFilter);
    }
  }

  assetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchAssetTab(target);
    });
  });

  // Quick navigation link in top navbar
  const navLinkHistoryQuick = document.getElementById('nav-link-history-quick');
  if (navLinkHistoryQuick) {
    navLinkHistoryQuick.addEventListener('click', (e) => {
      e.preventDefault();
      switchAssetTab('transactions');
      const asetSection = document.getElementById('aset');
      if (asetSection) asetSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  // --- SENTINEL COMING SOON & DROPDOWN ---
  const sentinelDropdown = document.getElementById('nav-sentinel-dropdown');
  const sentinelTrigger = document.getElementById('nav-link-sentinel');
  const openSentinelInstallBtn = document.getElementById('open-sentinel-install-btn');
  const sentinelModal = document.getElementById('sentinel-modal');
  const closeSentinelBtn = document.getElementById('close-sentinel-btn');
  const doneSentinelBtn = document.getElementById('done-sentinel-btn');

  if (sentinelTrigger && sentinelDropdown) {
    sentinelTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = sentinelDropdown.classList.contains('open');
      if (isOpen) {
        sentinelDropdown.classList.remove('open');
        sentinelTrigger.setAttribute('aria-expanded', 'false');
      } else {
        sentinelDropdown.classList.add('open');
        sentinelTrigger.setAttribute('aria-expanded', 'true');
      }
    });
  }

  // Close Sentinel dropdown on outside click
  document.addEventListener('click', (e) => {
    if (sentinelDropdown && !sentinelDropdown.contains(e.target)) {
      sentinelDropdown.classList.remove('open');
      if (sentinelTrigger) sentinelTrigger.setAttribute('aria-expanded', 'false');
    }
  });

  if (openSentinelInstallBtn) {
    openSentinelInstallBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (sentinelDropdown) sentinelDropdown.classList.remove('open');
      if (sentinelTrigger) sentinelTrigger.setAttribute('aria-expanded', 'false');
      openModal(sentinelModal);
    });
  }

  if (closeSentinelBtn) closeSentinelBtn.addEventListener('click', () => closeModal(sentinelModal));
  if (doneSentinelBtn) doneSentinelBtn.addEventListener('click', () => closeModal(sentinelModal));

  // --- MOBILE NAVIGATION DRAWER ---
  const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
  const mobileNavDrawer = document.getElementById('mobile-nav-drawer');
  const mobileNavBackdrop = document.getElementById('mobile-nav-backdrop');
  const mobileNavClose = document.getElementById('mobile-nav-close');
  const mobileSentinelBtn = document.getElementById('mobile-sentinel-btn');
  const mobileTxHistoryBtn = document.getElementById('mobile-tx-history-btn');
  const mobileLinkAnchors = document.querySelectorAll('.mobile-nav-link-anchor');

  function openMobileDrawer() {
    if (!mobileNavDrawer) return;
    mobileNavDrawer.classList.add('open');
    mobileNavDrawer.setAttribute('aria-hidden', 'false');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileDrawer() {
    if (!mobileNavDrawer) return;
    mobileNavDrawer.classList.remove('open');
    mobileNavDrawer.setAttribute('aria-hidden', 'true');
    if (mobileMenuToggle) mobileMenuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  if (mobileMenuToggle) mobileMenuToggle.addEventListener('click', openMobileDrawer);
  if (mobileNavClose) mobileNavClose.addEventListener('click', closeMobileDrawer);
  if (mobileNavBackdrop) mobileNavBackdrop.addEventListener('click', closeMobileDrawer);

  if (mobileSentinelBtn) {
    mobileSentinelBtn.addEventListener('click', () => {
      closeMobileDrawer();
      setTimeout(() => openModal(sentinelModal), 150);
    });
  }

  if (mobileTxHistoryBtn) {
    mobileTxHistoryBtn.addEventListener('click', () => {
      closeMobileDrawer();
      switchAssetTab('transactions');
      const asetSection = document.getElementById('aset');
      if (asetSection) asetSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  mobileLinkAnchors.forEach(a => {
    a.addEventListener('click', closeMobileDrawer);
  });

  // --- 8. REAL-TIME PULSE & SYNC TICKER ---
  const syncTimeCounter = document.getElementById('sync-time-counter');
  let secondsSinceSync = 5;

  setInterval(() => {
    secondsSinceSync++;
    if (secondsSinceSync > 24) {
      secondsSinceSync = 1; // Simulated live block/fx tick
    }
    if (syncTimeCounter) {
      syncTimeCounter.textContent = `${secondsSinceSync} detik lalu`;
    }
  }, 1000);

  // --- 8. MODAL CONTROLS (Join Community, Currencies, PGP, Sentinel) ---
  const communityModal = document.getElementById('community-modal');
  const closeCommunityBtn = document.getElementById('close-community-btn');
  const cancelCommunityBtn = document.getElementById('cancel-community-btn');
  const communityTriggers = document.querySelectorAll('.open-community-modal-trigger');
  const communityForm = document.getElementById('community-form');
  const formSuccessMsg = document.getElementById('form-success-msg');

  function openModal(modal) {
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Community Modal Events
  communityTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (mobileNavDrawer && mobileNavDrawer.classList.contains('open')) {
        closeMobileDrawer();
        setTimeout(() => openModal(communityModal), 120);
      } else {
        openModal(communityModal);
      }
    });
  });

  if (closeCommunityBtn) closeCommunityBtn.addEventListener('click', () => closeModal(communityModal));
  if (cancelCommunityBtn) cancelCommunityBtn.addEventListener('click', () => closeModal(communityModal));

  if (communityForm) {
    communityForm.addEventListener('submit', (e) => {
      e.preventDefault();
      communityForm.style.display = 'none';
      if (formSuccessMsg) formSuccessMsg.style.display = 'block';

      setTimeout(() => {
        closeModal(communityModal);
        // Reset form for future submissions
        setTimeout(() => {
          communityForm.reset();
          communityForm.style.display = 'flex';
          if (formSuccessMsg) formSuccessMsg.style.display = 'none';
        }, 300);
      }, 2500);
    });
  }

  // PGP Modal Events
  const pgpModal = document.getElementById('pgp-modal');
  const showPgpBtn = document.getElementById('show-pgp-btn');
  const closePgpBtn = document.getElementById('close-pgp-btn');

  if (showPgpBtn) {
    showPgpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(pgpModal);
    });
  }
  if (closePgpBtn) closePgpBtn.addEventListener('click', () => closeModal(pgpModal));

  // Global Backdrop Click and Escape Key Handling
  [communityModal, pgpModal, sentinelModal].forEach(modal => {
    if (!modal) return;
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(communityModal);
      closeModal(pgpModal);
      closeModal(sentinelModal);
      closeCurrencyDropdown();
      if (sentinelDropdown) sentinelDropdown.classList.remove('open');
    }
  });

  // --- 9. TRANSACTION LEDGER & LIVE MARKET ENGINE ---
  let currentTransactions = [];
  let activeTxFilter = 'ALL';
  let lastBackendUpdated = null;
  let liveCryptoPrices = {
    BTC: { usd: 85332 },
    HYPE: { usd: 93.54 },
    USD_IDR: 17758
  };

  // Filter Button Interactions
  const txFilterBtns = document.querySelectorAll('.tx-filter-btn');
  txFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      txFilterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeTxFilter = btn.getAttribute('data-filter') || 'ALL';
      renderTransactions(activeTxFilter);
    });
  });

  /**
   * Drag-to-Scroll (Grab & Drag) Handler
   * Allows users to drag scrollable containers with mouse smoothly without ugly system scrollbars
   */
  function enableDragScroll(container) {
    if (!container) return;
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let hasDragged = false;

    container.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.tagName === 'INPUT' || (e.target.classList && e.target.classList.contains('tx-ref-code'))) {
        return;
      }
      isDown = true;
      hasDragged = false;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      container.classList.add('is-dragging');
    });

    window.addEventListener('mouseup', () => {
      if (!isDown) return;
      isDown = false;
      container.classList.remove('is-dragging');
    });

    container.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 4) {
        hasDragged = true;
      }
      container.scrollLeft = scrollLeft - walk;
    });

    container.addEventListener('click', (e) => {
      if (hasDragged) {
        e.preventDefault();
        e.stopPropagation();
        hasDragged = false;
      }
    }, true);
  }

  // Initialize drag scroll for all horizontal scrollable containers
  const txTableContainer = document.querySelector('.tx-table-container');
  if (txTableContainer) enableDragScroll(txTableContainer);

  const tickerScrollContainer = document.getElementById('ticker-items-scroll');
  if (tickerScrollContainer) enableDragScroll(tickerScrollContainer);

  const assetTabsContainer = document.querySelector('.asset-view-tabs');
  if (assetTabsContainer) enableDragScroll(assetTabsContainer);

  const txFilterGroup = document.querySelector('.tx-filter-group');
  if (txFilterGroup) enableDragScroll(txFilterGroup);

  /**
   * Renders Transaction History table, mobile cards, and summary stats
   */
  function renderTransactions(filter = activeTxFilter) {
    const tableBody = document.getElementById('tx-table-body');
    const mobileCards = document.getElementById('tx-mobile-cards');
    const currConfig = CURRENCIES[activeCurrencyCode] || CURRENCIES.USD;
    const usdRate = liveCryptoPrices.USD_IDR || 17812;

    // 1. Filter Transactions
    const filtered = filter === 'ALL'
      ? currentTransactions
      : currentTransactions.filter(t => t.type === filter);

    const filterLabel = filter === 'ALL' ? '' : filter === 'BUY' ? 'pembelian (BUY)' : filter === 'SELL' ? 'penjualan (SELL)' : filter === 'DEPOSIT' ? 'deposit' : filter;
    const emptyMsg = filterLabel ? `Belum ada riwayat transaksi ${filterLabel} yang tercatat.` : 'Belum ada riwayat transaksi yang tercatat di Ledger.';

    // 3. Render Desktop Table
    if (tableBody) {
      if (filtered.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
              ${emptyMsg}
            </td>
          </tr>
        `;
      } else {
        let rowsHtml = '';
        filtered.forEach(t => {
          const dt = t.tx_timestamp ? new Date(t.tx_timestamp) : new Date();
          const dateStr = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
          const timeStr = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';

          const isBuy = t.type === 'BUY';
          const isSell = t.type === 'SELL';
          const isDeposit = t.type === 'DEPOSIT';
          const badgeClass = isBuy ? 'badge-tx-buy' : isSell ? 'badge-tx-sell' : isDeposit ? 'badge-tx-deposit' : 'badge-tx-withdraw';
          const badgeText = isBuy ? 'Beli' : isSell ? 'Jual' : isDeposit ? 'Deposit' : t.type;

          let rateConverted, amtConverted, feeConverted, pnlConverted;
          const isCurrentIdr = (activeCurrencyCode === 'IDR');

          if (isCurrentIdr) {
            rateConverted = Math.round(parseFloat(t.rate_idr) || 0);
            amtConverted = Math.round(parseFloat(t.amount_idr) || 0);
            feeConverted = Math.round(parseFloat(t.fee_idr) || 0);
            if (isSell && typeof t.sale_pnl_idr === 'number') {
              pnlConverted = Math.round(t.sale_pnl_idr || 0);
            }
          } else {
            const effectiveUsdRate = usdRate || 17800;
            const rateUsd = (parseFloat(t.rate_idr) || 0) / effectiveUsdRate;
            rateConverted = Math.round(rateUsd * currConfig.rate);

            const amtUsd = (parseFloat(t.amount_idr) || 0) / effectiveUsdRate;
            amtConverted = Math.round(amtUsd * currConfig.rate);

            const feeUsd = (parseFloat(t.fee_idr) || 0) / effectiveUsdRate;
            feeConverted = Math.round(feeUsd * currConfig.rate);

            if (isSell && typeof t.sale_pnl_idr === 'number') {
              pnlConverted = Math.round(((t.sale_pnl_idr || 0) / effectiveUsdRate) * currConfig.rate);
            }
          }

          const units = parseFloat(t.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

          let saleNoteHtml = '';
          if (isSell && typeof t.sale_pnl_idr === 'number') {
            const isProfit = t.sale_pnl_idr >= 0;
            saleNoteHtml = `<span class="tx-sale-note ${isProfit ? 'mono-up' : 'mono-down'}">PNL: ${isProfit ? '+' : ''}${currConfig.symbol}${pnlConverted.toLocaleString(currConfig.locale)}</span>`;
          }

          rowsHtml += `
            <tr>
              <td>
                <div style="font-weight: 500;">${dateStr}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${timeStr}</div>
              </td>
              <td><span class="badge-tx ${badgeClass}">${badgeText}</span></td>
              <td><strong>${t.asset}</strong></td>
              <td class="font-mono">${units} ${t.asset}</td>
              <td class="font-mono">${currConfig.symbol}${rateConverted.toLocaleString(currConfig.locale)}</td>
              <td class="font-mono">
                <strong>${currConfig.symbol}${amtConverted.toLocaleString(currConfig.locale)}</strong>
                ${saleNoteHtml}
              </td>
              <td class="font-mono" style="color: var(--text-muted);">${feeConverted > 0 ? `${currConfig.symbol}${feeConverted.toLocaleString(currConfig.locale)}` : 'Gratis'}</td>
              <td><span class="tx-ref-code" title="${t.reference_id}">${t.reference_id}</span></td>
              <td><span class="sync-status" style="font-size: 10px;">${t.status || 'COMPLETED'}</span></td>
            </tr>
          `;
        });
        tableBody.innerHTML = rowsHtml;
      }
    }

    // 4. Render Mobile Cards
    if (mobileCards) {
      if (filtered.length === 0) {
        mobileCards.innerHTML = `
          <div style="text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px;">
            ${emptyMsg}
          </div>
        `;
      } else {
        let cardsHtml = '';
        filtered.forEach(t => {
          const dt = t.tx_timestamp ? new Date(t.tx_timestamp) : new Date();
          const dateStr = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' WIB';

          const isBuy = t.type === 'BUY';
          const isSell = t.type === 'SELL';
          const isDeposit = t.type === 'DEPOSIT';
          const badgeClass = isBuy ? 'badge-tx-buy' : isSell ? 'badge-tx-sell' : isDeposit ? 'badge-tx-deposit' : 'badge-tx-withdraw';
          const badgeText = isBuy ? 'Beli' : isSell ? 'Jual' : isDeposit ? 'Deposit' : t.type;

          let rateConverted, amtConverted, feeConverted, pnlConverted;
          const isCurrentIdr = (activeCurrencyCode === 'IDR');

          if (isCurrentIdr) {
            rateConverted = Math.round(parseFloat(t.rate_idr) || 0);
            amtConverted = Math.round(parseFloat(t.amount_idr) || 0);
            feeConverted = Math.round(parseFloat(t.fee_idr) || 0);
            if (isSell && typeof t.sale_pnl_idr === 'number') {
              pnlConverted = Math.round(t.sale_pnl_idr || 0);
            }
          } else {
            const effectiveUsdRate = usdRate || 17800;
            const rateUsd = (parseFloat(t.rate_idr) || 0) / effectiveUsdRate;
            rateConverted = Math.round(rateUsd * currConfig.rate);

            const amtUsd = (parseFloat(t.amount_idr) || 0) / effectiveUsdRate;
            amtConverted = Math.round(amtUsd * currConfig.rate);

            const feeUsd = (parseFloat(t.fee_idr) || 0) / effectiveUsdRate;
            feeConverted = Math.round(feeUsd * currConfig.rate);

            if (isSell && typeof t.sale_pnl_idr === 'number') {
              pnlConverted = Math.round(((t.sale_pnl_idr || 0) / effectiveUsdRate) * currConfig.rate);
            }
          }

          const units = parseFloat(t.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

          let saleNoteHtml = '';
          if (isSell && typeof t.sale_pnl_idr === 'number') {
            const isProfit = t.sale_pnl_idr >= 0;
            saleNoteHtml = `<div class="${isProfit ? 'mono-up' : 'mono-down'}" style="font-size: 11px; margin-top: 2px;">PNL: ${isProfit ? '+' : ''}${currConfig.symbol}${pnlConverted.toLocaleString(currConfig.locale)}</div>`;
          }

          cardsHtml += `
            <div class="tx-card">
              <div class="tx-card-header">
                <span class="badge-tx ${badgeClass}">${badgeText} ${t.asset}</span>
                <span class="tx-card-time">${dateStr}</span>
              </div>
              <div class="tx-card-body">
                <div class="tx-card-field">
                  <span class="tx-card-label">Jumlah Unit</span>
                  <span class="tx-card-val font-mono">${units} ${t.asset}</span>
                </div>
                <div class="tx-card-field">
                  <span class="tx-card-label">Total Nilai</span>
                  <span class="tx-card-val font-mono">${currConfig.symbol}${amtConverted.toLocaleString(currConfig.locale)}</span>
                  ${saleNoteHtml}
                </div>
                <div class="tx-card-field">
                  <span class="tx-card-label">Harga / Kurs</span>
                  <span class="tx-card-val font-mono">${currConfig.symbol}${rateConverted.toLocaleString(currConfig.locale)}</span>
                </div>
                <div class="tx-card-field">
                  <span class="tx-card-label">Status</span>
                  <span class="tx-card-val" style="color: #38ef7d; font-size: 11.5px;">✓ Selesai</span>
                </div>
              </div>
              <div class="tx-card-footer">
                <span class="tx-ref-code">${t.reference_id}</span>
                <span style="color: var(--text-muted); font-size: 10.5px;">Triv Exchange</span>
              </div>
            </div>
          `;
        });
        mobileCards.innerHTML = cardsHtml;
      }
    }
  }

  // --- 10. INITIALIZATION & DYNAMIC ALLOCATION ENGINE ---
  function renderHoldingsAndAllocations() {
    const holdingsContainer = document.getElementById('holdings-panel-container');
    const donutSegmentsGroup = document.getElementById('donut-segments-group');
    const donutCenterVal = document.getElementById('donut-center-val');
    const donutCenterSub = document.getElementById('donut-center-sub');
    const legendGrid = document.getElementById('allocation-legend-grid');
    if (liveCryptoPrices && liveCryptoPrices.USD_IDR > 0) {
      CURRENCIES.IDR.rate = liveCryptoPrices.USD_IDR;
    }
    const currConfig = CURRENCIES[activeCurrencyCode] || CURRENCIES.USD;

    // 1. Render Holdings Panel
    if (holdingsContainer) {
      if (!currentHoldings || currentHoldings.length === 0) {
        holdingsContainer.innerHTML = `
          <div class="empty-holdings-card">
            <div class="empty-icon">🛡️</div>
            <div class="empty-title">Ledger Bersih (Saldo ${currConfig.symbol}0)</div>
            <div class="empty-desc">
              Belum ada transaksi tercatat. Kirimkan screenshot struk transaksi Triv ke Telegram Sentinel Bot (<a href="https://t.me/SevntinelBot" target="_blank" rel="noopener">@SevntinelBot</a>) untuk mencatat transaksi dan aset pertama.
            </div>
          </div>
        `;
      } else {
        let html = '';
        currentHoldings.forEach(h => {
          const theme = getAssetTheme(h.code);
          const isCrypto = h.code !== 'CASH';

          let valConverted = 0;
          let avgConverted = 0;
          let liveConverted = 0;
          let pnlConverted = 0;

          if (activeCurrencyCode === 'IDR') {
            valConverted = typeof h.valueIdr === 'number' ? h.valueIdr : Math.round((h.valueUsd || 0) * currConfig.rate);
            avgConverted = typeof h.avgBuyPriceIdr === 'number' ? h.avgBuyPriceIdr : Math.round((h.avgBuyPriceUsd || 0) * currConfig.rate);
            liveConverted = typeof h.currentPriceIdr === 'number' ? h.currentPriceIdr : Math.round((h.currentPriceUsd || 0) * currConfig.rate);
            pnlConverted = typeof h.unrealizedPnlIdr === 'number' ? h.unrealizedPnlIdr : Math.round((h.unrealizedPnlUsd || 0) * currConfig.rate);
          } else if (activeCurrencyCode === 'USD') {
            valConverted = h.valueUsd || 0;
            avgConverted = h.avgBuyPriceUsd || 0;
            liveConverted = h.currentPriceUsd || 0;
            pnlConverted = h.unrealizedPnlUsd || 0;
          } else {
            valConverted = Math.round((h.valueUsd || 0) * currConfig.rate);
            avgConverted = Math.round((h.avgBuyPriceUsd || 0) * currConfig.rate);
            liveConverted = Math.round((h.currentPriceUsd || 0) * currConfig.rate);
            pnlConverted = Math.round((h.unrealizedPnlUsd || 0) * currConfig.rate);
          }

          const valFormatted = activeCurrencyCode === 'USD'
            ? valConverted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : Math.round(valConverted).toLocaleString(currConfig.locale);

          const pnlPct = typeof h.unrealizedPnlPct === 'number' ? h.unrealizedPnlPct : 0;
          const isProfit = pnlPct >= 0;

          // Subtitles for units & prices
          let unitsSubText = h.unitsText;
          let metricSubText = '';
          if (isCrypto && avgConverted > 0) {
            unitsSubText += ` · Beli: ${currConfig.symbol}${Math.round(avgConverted).toLocaleString(currConfig.locale)}`;
            metricSubText = `<div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Harga Live: ${currConfig.symbol}${Math.round(liveConverted).toLocaleString(currConfig.locale)}</div>`;
          }

          const changeBadgeText = isCrypto
            ? `${isProfit ? '▲ +' : '▼ '}${pnlPct.toFixed(1)}% (${currConfig.symbol}${Math.abs(Math.round(pnlConverted)).toLocaleString(currConfig.locale)})`
            : 'Cadangan Kas (Stabil)';

          html += `
            <article class="holding-row" data-holding="${h.code.toLowerCase()}">
              <div class="col-asset">
                <div class="asset-icon" aria-hidden="true" style="border-color: rgba(255,255,255,0.15);">${theme.icon}</div>
                <div class="asset-details">
                  <h3 class="asset-name">${h.name}</h3>
                  <span class="asset-units">${unitsSubText}</span>
                </div>
              </div>

              <div class="col-metric">
                <div class="col-label">Valuasi Terkonversi</div>
                <div class="col-value asset-converted-val odometer" data-asset-code="${h.code}" data-base-usd="${h.valueUsd}">${currConfig.symbol}${valFormatted}</div>
                ${metricSubText}
              </div>

              <div class="col-metric">
                <div class="col-label">${isCrypto ? 'PNL' : 'Status Cadangan'}</div>
                <div class="change-tag ${isCrypto ? (isProfit ? 'mono-up' : 'mono-down') : ''}" style="${!isCrypto ? 'background: rgba(255,255,255,0.06); color: var(--text-secondary);' : ''}">
                  ${changeBadgeText}
                </div>
              </div>

              <div class="col-allocation">
                <div class="col-label flex-between">
                  <span>Alokasi Total</span>
                  <span class="alloc-num">${h.allocationPct}%</span>
                </div>
                <div class="track" title="Alokasi ${h.allocationPct}% dari total portofolio">
                  <div class="fill" style="width: ${h.allocationPct}%; background: ${theme.color};"></div>
                </div>
              </div>
            </article>
          `;
        });
        holdingsContainer.innerHTML = html;
      }
    }

    // 2. Render Donut Segments and Center Label
    const circumference = 339.3;
    if (donutCenterVal) {
      donutCenterVal.textContent = currentHoldings ? currentHoldings.length : 0;
    }
    if (donutCenterSub) {
      donutCenterSub.textContent = (!currentHoldings || currentHoldings.length === 0) ? 'Aset' : 'Klasifikasi';
    }

    if (donutSegmentsGroup) {
      donutSegmentsGroup.innerHTML = '';
      if (currentHoldings && currentHoldings.length > 0) {
        let accumOffset = 0;
        currentHoldings.forEach(h => {
          const theme = getAssetTheme(h.code);
          const segLen = Math.max(0.5, (h.allocationPct / 100) * circumference);
          const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          circle.setAttribute('class', `donut-segment segment-${h.code.toLowerCase()}`);
          circle.setAttribute('cx', '70');
          circle.setAttribute('cy', '70');
          circle.setAttribute('r', '54');
          circle.setAttribute('stroke', theme.color);
          circle.setAttribute('stroke-dasharray', `${segLen.toFixed(1)} ${circumference.toFixed(1)}`);
          circle.setAttribute('stroke-dashoffset', `${(-accumOffset).toFixed(1)}`);
          circle.setAttribute('data-asset', h.name);
          circle.setAttribute('data-target', h.code.toLowerCase());
          circle.setAttribute('data-pct', `${h.allocationPct}%`);
          donutSegmentsGroup.appendChild(circle);
          accumOffset += segLen;
        });
      }
    }

    // 3. Render Allocation Legend Grid
    if (legendGrid) {
      if (!currentHoldings || currentHoldings.length === 0) {
        legendGrid.innerHTML = '<div class="empty-legend">Menunggu data aset dari transaksi ledger...</div>';
      } else {
        let legendHtml = '';
        currentHoldings.forEach(h => {
          const theme = getAssetTheme(h.code);
          legendHtml += `
            <div class="legend-item" data-target="${h.code.toLowerCase()}">
              <div class="legend-left">
                <span class="legend-swatch" style="background: ${theme.color};"></span>
                <div class="legend-info">
                  <span class="legend-name">${h.name}</span>
                  <span class="legend-sub">${h.unitsText}</span>
                </div>
              </div>
              <div class="legend-pct">${h.allocationPct}%</div>
            </div>
          `;
        });
        legendGrid.innerHTML = legendHtml;
      }
    }

    // 4. Update Performance Badge
    const badgeGrowthVal = document.getElementById('badge-growth-val');
    const badgePeriod = document.querySelector('.badge-period');
    if (badgeGrowthVal) {
      let totalCostUsd = 0;
      let totalCryptoValUsd = 0;
      currentHoldings.forEach(h => {
        if (h.code !== 'CASH') {
          totalCostUsd += (h.totalCostUsd || 0);
          totalCryptoValUsd += (h.valueUsd || 0);
        }
      });
      if (totalCostUsd > 0) {
        const growthPct = ((totalCryptoValUsd - totalCostUsd) / totalCostUsd) * 100;
        const sign = growthPct >= 0 ? '+' : '';
        badgeGrowthVal.textContent = `${sign}${growthPct.toFixed(1)}%`;
        if (badgePeriod) badgePeriod.textContent = 'bulan ini';
      } else if (REALIZED_PNL_USD > 0) {
        badgeGrowthVal.textContent = `+$${REALIZED_PNL_USD.toLocaleString('en-US')}`;
        if (badgePeriod) badgePeriod.textContent = 'PNL terealisasi';
      } else {
        badgeGrowthVal.textContent = '100%';
        if (badgePeriod) badgePeriod.textContent = 'kas aman';
      }
    }

    // 5. Update Dynamic Market Ticker Bar (Strictly reflects held assets)
    renderMarketTicker();

    // Rebind Donut & Legend hover interactions
    bindAllocationInteractions();
  }

  // --- 11. DYNAMIC 24/7 LIVE CRYPTO MARKET TICKER ---
  // Pastikan HANYA koin yang sedang dipegang yang ditampilkan di feed.
  // Jika Hyperliquid dijual (0 HYPE tersisa), feed tidak lagi menampilkan HYPE sama sekali.
  function renderMarketTicker() {
    const scrollContainer = document.getElementById('ticker-items-scroll');
    const badgeEl = document.getElementById('ticker-source-badge');
    if (!scrollContainer) return;

    // Filter aset kripto aktif yang memiliki saldo > 0
    const activeCryptos = (currentHoldings || []).filter(h => h.code !== 'CASH' && h.quantity > 0.000001);
    const usdIdrRate = liveCryptoPrices.USD_IDR || 17812;

    let chipsHtml = '';
    let sources = [];

    if (activeCryptos.length === 0) {
      // Jika TIDAK ADA kripto yang sedang dipegang (100% Kas Tunai setelah penjualan):
      // Hilangkan seluruh indikasi HYPE/BTC agar publik tidak bingung.
      chipsHtml = `
        <div class="ticker-chip" id="ticker-chip-usdidr">
          <span class="chip-coin">USD/IDR</span>
          <span class="chip-price font-mono" id="ticker-usdidr-val">Rp ${usdIdrRate.toLocaleString('id-ID')}</span>
        </div>
        <div class="ticker-chip chip-cash-status">
          <span class="chip-coin">KAS</span>
          <span class="chip-price font-mono">100% Cadangan Tunai</span>
          <span class="chip-change mono-neutral">Liquid</span>
        </div>
      `;
      if (badgeEl) badgeEl.textContent = 'Bank Indonesia · FX Market';
    } else {
      // Render chip HANYA untuk koin kripto yang benar-benar aktif dipegang
      activeCryptos.forEach(c => {
        const code = c.code.toUpperCase();
        const priceObj = liveCryptoPrices[code] || { usd: c.currentPriceUsd || 0 };
        const priceVal = priceObj.usd || c.currentPriceUsd || 0;
        const priceFormatted = priceVal >= 1000
          ? `$${priceVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : `$${priceVal.toFixed(2)}`;

        chipsHtml += `
          <div class="ticker-chip" id="ticker-chip-${code.toLowerCase()}">
            <span class="chip-coin">${code}/USD</span>
            <span class="chip-price font-mono" id="ticker-${code.toLowerCase()}-val">${priceFormatted}</span>
            <span class="chip-change mono-up">Live</span>
          </div>
        `;

        if (code === 'HYPE') sources.push('Hyperliquid L1');
        else if (code === 'BTC') sources.push('Binance');
        else sources.push(`${code} On-Chain`);
      });

      // Tambahkan chip konversi kurs USD/IDR
      chipsHtml += `
        <div class="ticker-chip" id="ticker-chip-usdidr">
          <span class="chip-coin">USD/IDR</span>
          <span class="chip-price font-mono" id="ticker-usdidr-val">Rp ${usdIdrRate.toLocaleString('id-ID')}</span>
        </div>
      `;

      if (badgeEl) {
        sources.push('FX Rate');
        badgeEl.textContent = sources.join(' · ');
      }
    }

    scrollContainer.innerHTML = chipsHtml;
  }

  // --- 10.5 REAL-TIME USD/IDR FOREX POLLER (1:1 PARITY) ---
  async function fetchLiveForexRates() {
    try {
      let idrRate = null;

      // 1. Primary: open.er-api.com (real-time USD/IDR exchange rate)
      try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (res.ok) {
          const data = await res.json();
          if (data?.rates?.IDR && data.rates.IDR > 10000) {
            idrRate = Math.round(data.rates.IDR);
          }
        }
      } catch (e) {}

      // 2. Fallback: jsDelivr currency-api
      if (!idrRate) {
        try {
          const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
          if (res.ok) {
            const data = await res.json();
            if (data?.usd?.idr && data.usd.idr > 10000) {
              idrRate = Math.round(data.usd.idr);
            }
          }
        } catch (e) {}
      }

      if (idrRate) {
        liveCryptoPrices.USD_IDR = idrRate;
        CURRENCIES.IDR.rate = idrRate;
        renderMarketTicker();

        if (activeCurrencyCode === 'IDR') {
          updateCurrencyUI('IDR', false);
          renderTransactions(activeTxFilter);
        }
      }
    } catch (err) {
      console.warn('Live USD/IDR forex poller warning:', err.message);
    }
  }

  // --- 11. 24/7 REALTIME LIVE CRYPTO MARKET POLLER ---
  async function fetchLiveMarketPrices() {
    try {
      let btcUsd = null;
      let hypeUsd = null;
      let rawUsdtIdr = null;

      // 1. Fetch Binance ticker for BTC (Primary Spot Gold Standard)
      try {
        const bRes = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        if (bRes.ok) {
          const bData = await bRes.json();
          const p = parseFloat(bData.price);
          if (p > 0) btcUsd = parseFloat(p.toFixed(2));
        }
      } catch (e) {}

      // 2. Fetch Hyperliquid official L1 API (Primary for HYPE & fallback for BTC)
      try {
        const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'allMids' })
        });
        if (hlRes.ok) {
          const mids = await hlRes.json();
          if (mids.HYPE) {
            const hp = parseFloat(mids.HYPE);
            if (hp > 0) hypeUsd = parseFloat(hp.toFixed(2));
          }
          if (!btcUsd && mids.BTC) {
            const bp = parseFloat(mids.BTC);
            if (bp > 0) btcUsd = parseFloat(bp.toFixed(2));
          }
        }
      } catch (e) {}

      // 2.5 CoinGecko fallback for BTC & HYPE if primary failed or blocked by ISP
      if (!btcUsd || !hypeUsd) {
        try {
          const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,hyperliquid&vs_currencies=usd,idr');
          if (cgRes.ok) {
            const cgData = await cgRes.json();
            if (!btcUsd && cgData.bitcoin && cgData.bitcoin.usd) {
              btcUsd = parseFloat(cgData.bitcoin.usd);
            }
            if (!hypeUsd && cgData.hyperliquid && cgData.hyperliquid.usd) {
              hypeUsd = parseFloat(cgData.hyperliquid.usd);
            }
            if (!rawUsdtIdr && cgData.bitcoin && cgData.bitcoin.usd && cgData.bitcoin.idr) {
              const impliedIdrRate = Math.round(cgData.bitcoin.idr / cgData.bitcoin.usd);
              if (impliedIdrRate > 10000 && impliedIdrRate < 25000) {
                rawUsdtIdr = impliedIdrRate;
              }
            }
          }
        } catch (e) {}
      }

      // 3. Fetch Binance USDTIDR bookTicker for live stable crypto USD/IDR rate (Mid-Market Benchmark)
      try {
        const idrRes = await fetch('https://api.binance.com/api/v3/ticker/bookTicker?symbol=USDTIDR');
        if (idrRes.ok) {
          const idrData = await idrRes.json();
          const bid = parseFloat(idrData.bidPrice);
          const ask = parseFloat(idrData.askPrice);
          if (bid > 10000 && ask < 25000) {
            rawUsdtIdr = (bid + ask) / 2;
          }
        }
      } catch (e) {}

      // Fallback single price ticker for USDTIDR
      if (!rawUsdtIdr) {
        try {
          const idrSingle = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=USDTIDR');
          if (idrSingle.ok) {
            const sData = await idrSingle.json();
            const sp = parseFloat(sData.price);
            if (sp > 10000 && sp < 25000) rawUsdtIdr = sp;
          }
        } catch (e) {}
      }

      // 4. Update in-memory live prices with responsive forex rate
      if (btcUsd) liveCryptoPrices.BTC.usd = btcUsd;
      if (hypeUsd) liveCryptoPrices.HYPE.usd = hypeUsd;
      if (rawUsdtIdr && rawUsdtIdr > 10000 && rawUsdtIdr < 25000) {
        const roundedRate = Math.round(rawUsdtIdr);
        liveCryptoPrices.USD_IDR = roundedRate;
        CURRENCIES.IDR.rate = roundedRate;
      } else if (CURRENCIES.IDR.rate > 0) {
        liveCryptoPrices.USD_IDR = Math.round(CURRENCIES.IDR.rate);
      }

      // Update Ticker Chips dynamically
      renderMarketTicker();

      // Recalculate Holdings and Portfolio Valuation Dynamically in Real-time (1:1 Native Precision)
      if (currentHoldings && currentHoldings.length > 0) {
        const rate = liveCryptoPrices.USD_IDR || CURRENCIES.IDR.rate || 17840;
        CURRENCIES.IDR.rate = rate;
        let newTotalUsd = 0;

        currentHoldings.forEach(h => {
          if (h.code !== 'CASH') {
            const livePriceUsd = (liveCryptoPrices[h.code] && liveCryptoPrices[h.code].usd)
              ? liveCryptoPrices[h.code].usd
              : (h.currentPriceUsd || 0);

            if (livePriceUsd > 0) {
              h.currentPriceUsd = livePriceUsd;
              h.currentPriceIdr = Math.round(livePriceUsd * rate);
              h.valueUsd = parseFloat((h.quantity * livePriceUsd).toFixed(2));
              h.valueIdr = Math.round(h.quantity * h.currentPriceIdr);

              const costIdr = h.totalCostIdr || 0;
              const costUsd = h.totalCostUsd || (costIdr / rate) || 0;

              h.unrealizedPnlIdr = h.valueIdr - costIdr;
              h.unrealizedPnlUsd = parseFloat((h.valueUsd - costUsd).toFixed(2));
              h.unrealizedPnlPct = costUsd > 0 ? parseFloat(((h.unrealizedPnlUsd / costUsd) * 100).toFixed(2)) : 0;
              h.change30d = (h.unrealizedPnlPct >= 0 ? '+' : '') + h.unrealizedPnlPct.toFixed(1) + '%';
            }
          }
          newTotalUsd += (h.valueUsd || 0);
        });

        // Sensitivity threshold check: only trigger odometer animation if total changed by >= $0.05
        const priceChanged = Math.abs(BASE_TOTAL_USD - newTotalUsd) >= 0.05;
        BASE_TOTAL_USD = parseFloat(newTotalUsd.toFixed(2));
        currentHoldings.forEach(h => {
          h.allocationPct = BASE_TOTAL_USD > 0
            ? parseFloat(((h.valueUsd / BASE_TOTAL_USD) * 100).toFixed(1))
            : 0;
        });

        renderHoldingsAndAllocations();
        if (priceChanged) {
          updateCurrencyUI(activeCurrencyCode, false);
        }
      }
    } catch (err) {
      console.warn('Realtime price ticker warning:', err.message);
    }
  }

  let lastSyncSuccess = Date.now();

  async function syncPortfolioFromBackend() {
    try {
      let data = null;

      // 1. Try relative /api/portfolio/summary
      try {
        const res = await fetch('/api/portfolio/summary');
        if (res.ok) data = await res.json();
      } catch (e) {}

      // 2. Try ./data/portfolio.json (works on GitHub Pages static hosting)
      if (!data || typeof data.totalValuationUsd !== 'number') {
        try {
          const resStatic = await fetch('./data/portfolio.json?t=' + Date.now());
          if (resStatic.ok) data = await resStatic.json();
        } catch (e) {}
      }

      // 2.5 Try raw GitHub repository data for instantaneous updates
      if (!data || typeof data.totalValuationUsd !== 'number') {
        try {
          const resRaw = await fetch('https://raw.githubusercontent.com/ryuukage-byte/almere/main/data/portfolio.json?t=' + Date.now());
          if (resRaw.ok) data = await resRaw.json();
        } catch (e) {}
      }

      // 3. Try local node server directly (http://127.0.0.1:4173)
      if (!data || typeof data.totalValuationUsd !== 'number') {
        try {
          const resLocal = await fetch('http://127.0.0.1:4173/api/portfolio/summary');
          if (resLocal.ok) data = await resLocal.json();
        } catch (e) {}
      }

      if (!data || typeof data.totalValuationUsd !== 'number') return;

      const txCount = Array.isArray(data.transactions) ? data.transactions.length : (data.transactionCount || 0);
      const isNewData = !lastBackendUpdated || (data.lastUpdated && data.lastUpdated !== lastBackendUpdated) || (txCount !== currentTransactions.length);

      if (isNewData) {
        lastBackendUpdated = data.lastUpdated || Date.now().toString();
        if (Array.isArray(data.transactions)) {
          currentTransactions = data.transactions;
        }
        if (typeof data.realizedPnlUsd === 'number') REALIZED_PNL_USD = data.realizedPnlUsd;
        if (typeof data.realizedPnlIdr === 'number') REALIZED_PNL_IDR = data.realizedPnlIdr;

        // Only adopt backend holdings valuation if we don't have live market prices already active
        if (!currentHoldings || currentHoldings.length === 0) {
          BASE_TOTAL_USD = data.totalValuationUsd;
          currentHoldings = data.holdings || [];
          if (data.marketPrices) {
            if (data.marketPrices.BTC?.usd) liveCryptoPrices.BTC.usd = data.marketPrices.BTC.usd;
            if (data.marketPrices.HYPE?.usd) liveCryptoPrices.HYPE.usd = data.marketPrices.HYPE.usd;
          }
          if (data.forexRates && typeof data.forexRates === 'object') {
            Object.keys(CURRENCIES).forEach(code => {
              if (code === 'USD') return;
              if (typeof data.forexRates[code] === 'number') {
                CURRENCIES[code].rate = data.forexRates[code];
              }
            });
          }
          if (data.usdIdrRate) {
            liveCryptoPrices.USD_IDR = data.usdIdrRate;
            CURRENCIES.IDR.rate = data.usdIdrRate;
          }
          renderHoldingsAndAllocations();
          renderMarketTicker();
          renderTransactions(activeTxFilter);
          updateCurrencyUI(activeCurrencyCode, false);
        } else {
          if (data.forexRates && typeof data.forexRates === 'object') {
            Object.keys(CURRENCIES).forEach(code => {
              if (code === 'USD') return;
              if (typeof data.forexRates[code] === 'number') {
                CURRENCIES[code].rate = data.forexRates[code];
              }
            });
          }
          // Sync base quantities and costs without overwriting live market valuation
          (data.holdings || []).forEach(dh => {
            const match = currentHoldings.find(h => h.code === dh.code);
            if (match) {
              match.quantity = dh.quantity;
              match.unitsText = dh.unitsText;
              match.totalCostIdr = dh.totalCostIdr;
              match.totalCostUsd = dh.totalCostUsd;
              match.avgBuyPriceIdr = dh.avgBuyPriceIdr;
              match.avgBuyPriceUsd = dh.avgBuyPriceUsd;
            } else {
              currentHoldings.push(dh);
            }
          });
          renderTransactions(activeTxFilter);
        }
      }

      lastSyncSuccess = Date.now();
      const syncCounter = document.getElementById('sync-time-counter');
      if (syncCounter) syncCounter.textContent = 'Baru saja';
    } catch (err) {
      console.warn('Portfolio sync warning:', err.message);
    }
  }

  // Update sync timestamp indicator every 5s
  setInterval(() => {
    const syncCounter = document.getElementById('sync-time-counter');
    if (!syncCounter) return;
    const elapsedSec = Math.floor((Date.now() - lastSyncSuccess) / 1000);
    if (elapsedSec < 10) {
      syncCounter.textContent = 'Baru saja';
    } else {
      syncCounter.textContent = `${elapsedSec} detik lalu`;
    }
  }, 5000);

  // Trigger initial UI rendering & live price loops
  renderHoldingsAndAllocations();
  updateCurrencyUI('USD', true);
  renderHistoricalChart();
  syncPortfolioFromBackend();
  fetchLiveForexRates();
  fetchLiveMarketPrices();

  // Polling intervals:
  // 1. Live crypto market price movements every 15s (smooth, stable, non-volatile rate polling)
  setInterval(fetchLiveMarketPrices, 15000);

  // 1.5 Real-time Forex USD/IDR exchange rate every 60s
  setInterval(fetchLiveForexRates, 60000);

  // 2. Ledger sync every 20s to capture newly confirmed Triv transactions without race conditions
  setInterval(syncPortfolioFromBackend, 20000);

})();

