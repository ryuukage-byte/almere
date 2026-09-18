/**
 * Almere & Co — Interactive Application Logic
 * Implements Currency Switching, High-DPI Historical Portfolio Line Chart,
 * Donut Allocation Interactivity, Real-time Sync Telemetry, and Modals.
 */

(function () {
  'use strict';

  // --- 1. DATA & STATE ---
  const BASE_HOLDINGS = {
    btc: { name: 'Bitcoin', units: '1.24 BTC', usd: 118900, pct: 63.8, change30d: '+9.4%' },
    hype: { name: 'Hyperliquid', units: '2,150 HYPE', usd: 52300, pct: 28.1, change30d: '+21.6%' },
    cash: { name: 'Kas Tunai', units: 'USDC / USD', usd: 15220, pct: 8.2, change30d: '-1.1%' }
  };

  const BASE_TOTAL_USD = 186420;

  // Real-time exchange rates against USD
  const CURRENCIES = {
    USD: { symbol: '$', rate: 1.0, locale: 'en-US', digits: 0, name: 'Dolar AS' },
    IDR: { symbol: 'Rp ', rate: 16250, locale: 'id-ID', digits: 0, name: 'Rupiah Indonesia' },
    SGD: { symbol: 'S$', rate: 1.34, locale: 'en-SG', digits: 0, name: 'Dolar Singapura' },
    EUR: { symbol: '€', rate: 0.92, locale: 'de-DE', digits: 0, name: 'Euro' },
    GBP: { symbol: '£', rate: 0.78, locale: 'en-GB', digits: 0, name: 'Pound Sterling' },
    JPY: { symbol: '¥', rate: 154.2, locale: 'ja-JP', digits: 0, name: 'Yen Jepang' },
    AUD: { symbol: 'A$', rate: 1.52, locale: 'en-AU', digits: 0, name: 'Dolar Australia' },
    CAD: { symbol: 'CA$', rate: 1.37, locale: 'en-CA', digits: 0, name: 'Dolar Kanada' },
    CHF: { symbol: 'CHF ', rate: 0.89, locale: 'de-CH', digits: 0, name: 'Franc Swiss' },
    CNY: { symbol: '¥', rate: 7.23, locale: 'zh-CN', digits: 0, name: 'Yuan Tiongkok' },
    HKD: { symbol: 'HK$', rate: 7.81, locale: 'zh-HK', digits: 0, name: 'Dolar Hong Kong' },
    KRW: { symbol: '₩', rate: 1375, locale: 'ko-KR', digits: 0, name: 'Won Korea Selatan' },
    MYR: { symbol: 'RM ', rate: 4.71, locale: 'ms-MY', digits: 0, name: 'Ringgit Malaysia' },
    THB: { symbol: '฿', rate: 36.6, locale: 'th-TH', digits: 0, name: 'Baht Thailand' },
    VND: { symbol: '₫', rate: 25400, locale: 'vi-VN', digits: 0, name: 'Dong Vietnam' },
    PHP: { symbol: '₱', rate: 58.2, locale: 'en-PH', digits: 0, name: 'Peso Filipina' },
    TWD: { symbol: 'NT$', rate: 32.4, locale: 'zh-TW', digits: 0, name: 'Dolar Taiwan' },
    INR: { symbol: '₹', rate: 83.5, locale: 'en-IN', digits: 0, name: 'Rupee India' },
    AED: { symbol: 'AED ', rate: 3.67, locale: 'en-AE', digits: 0, name: 'Dirham UEA' },
    SAR: { symbol: 'SAR ', rate: 3.75, locale: 'ar-SA', digits: 0, name: 'Riyal Arab Saudi' },
    NZD: { symbol: 'NZ$', rate: 1.66, locale: 'en-NZ', digits: 0, name: 'Dolar Selandia Baru' },
    BRL: { symbol: 'R$ ', rate: 5.45, locale: 'pt-BR', digits: 0, name: 'Real Brasil' }
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
    if (!CURRENCIES[newCode]) return;
    activeCurrencyCode = newCode;
    const config = CURRENCIES[newCode];

    // Update dropdown trigger label
    if (currencyTriggerVal) {
      currencyTriggerVal.textContent = `${newCode} (${config.symbol.trim()})`;
    }

    // Update main total with odometer animation
    const targetTotal = Math.round(BASE_TOTAL_USD * config.rate);
    if (mainSymbolEl) mainSymbolEl.textContent = config.symbol;
    animateOdometer(totalValEl, targetTotal, config, {
      includeSymbol: false,
      duration: isInitial ? 1000 : 800
    });

    // Update holding rows with odometer animation
    holdingValElements.forEach(el => {
      const baseUsd = parseFloat(el.getAttribute('data-base-usd')) || 0;
      const targetHolding = Math.round(baseUsd * config.rate);
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

    const profile = HISTORICAL_PROFILES[activeTimeRange] || HISTORICAL_PROFILES['30D'];
    const rawData = profile.dataPoints;
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
    const range = maxVal - minVal;

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
  const donutSegments = document.querySelectorAll('.donut-segment');
  const legendItems = document.querySelectorAll('.legend-item');

  donutSegments.forEach(seg => {
    seg.addEventListener('mouseenter', () => {
      const asset = seg.getAttribute('data-asset');
      highlightAsset(asset);
    });
    seg.addEventListener('mouseleave', () => {
      resetHighlight();
    });
  });

  legendItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
      const target = item.getAttribute('data-target');
      if (target === 'btc') highlightAsset('Bitcoin');
      if (target === 'hype') highlightAsset('Hyperliquid');
      if (target === 'cash') highlightAsset('Kas tunai');
    });
    item.addEventListener('mouseleave', () => {
      resetHighlight();
    });
  });

  function highlightAsset(assetName) {
    legendItems.forEach(it => {
      const name = it.querySelector('.legend-name')?.textContent || '';
      if (name.toLowerCase().includes(assetName.toLowerCase())) {
        it.style.borderColor = 'rgba(255, 255, 255, 0.35)';
        it.style.background = 'rgba(255, 255, 255, 0.07)';
      } else {
        it.style.opacity = '0.5';
      }
    });
  }

  function resetHighlight() {
    legendItems.forEach(it => {
      it.style.borderColor = '';
      it.style.background = '';
      it.style.opacity = '1';
    });
  }

  // --- 7. ASSET VIEW TABS (Holdings, Distribution, History) ---
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

    // If switching to history tab, recalculate and re-render canvas immediately
    if (tabKey === 'history') {
      window.requestAnimationFrame(() => {
        renderHistoricalChart();
      });
    }
  }

  assetTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      switchAssetTab(target);
    });
  });

  // --- SENTINEL DROPDOWN & INSTALL MODAL ---
  const sentinelDropdown = document.getElementById('nav-sentinel-dropdown');
  const sentinelTrigger = document.getElementById('nav-link-sentinel');
  const openSentinelInstallBtn = document.getElementById('open-sentinel-install-btn');
  const sentinelModal = document.getElementById('sentinel-modal');
  const closeSentinelBtn = document.getElementById('close-sentinel-btn');
  const doneSentinelBtn = document.getElementById('done-sentinel-btn');
  const copySentinelCmdBtn = document.getElementById('copy-sentinel-cmd');
  const copySentinelCmdText = document.getElementById('copy-sentinel-cmd-text');
  const sentinelCmdText = document.getElementById('sentinel-install-cmd-text');

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

  if (copySentinelCmdBtn && sentinelCmdText) {
    function showCopySuccess() {
      if (copySentinelCmdText) {
        copySentinelCmdText.textContent = 'Tersalin ✓';
        setTimeout(() => {
          copySentinelCmdText.textContent = 'Salin';
        }, 2000);
      }
    }

    function fallbackCopy(text) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showCopySuccess();
      } catch (err) {
        // do nothing
      }
      document.body.removeChild(textarea);
    }

    copySentinelCmdBtn.addEventListener('click', () => {
      const textToCopy = sentinelCmdText.textContent || 'curl -fsSL https://sentinel.almere.co/install.sh | bash';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          showCopySuccess();
        }).catch(() => {
          fallbackCopy(textToCopy);
        });
      } else {
        fallbackCopy(textToCopy);
      }
    });
  }

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
  const openCommunityBtn = document.getElementById('open-community-btn');
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
  if (openCommunityBtn) {
    openCommunityBtn.addEventListener('click', () => openModal(communityModal));
  }
  communityTriggers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal(communityModal);
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

  // --- 9. INITIALIZATION ---
  // Trigger odometer count-up on initial appearance and when switching currencies
  updateCurrencyUI('USD', true);
  renderHistoricalChart();

})();
