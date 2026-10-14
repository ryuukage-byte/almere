/**
 * Almere Research — Research Papers & Reader Application Logic
 * Implements category filtering, seamless paper reader routing,
 * institutional research formatting, deep-linking, and paper publishing.
 */

(function () {
  'use strict';

  // --- STATE ---
  let allPapers = [];
  let activeCategory = 'Macro';
  let currentOpenPaperId = null;

  // --- DOM ELEMENTS ---
  const indexContainer = document.getElementById('research-index-container');
  const readerContainer = document.getElementById('paper-reader-container');
  const researchListEl = document.getElementById('research-list');
  const filterPills = document.querySelectorAll('.research-filter-pill');

  // Reader elements
  const readerBackBtn = document.getElementById('reader-back-btn');
  const readerCategoryPill = document.getElementById('reader-category-pill');
  const readerDateEl = document.getElementById('reader-date');
  const readerTimeEl = document.getElementById('reader-read-time');
  const readerTitleEl = document.getElementById('reader-title');
  const readerSubtitleEl = document.getElementById('reader-subtitle');
  const readerAuthorEl = document.getElementById('reader-author');
  const readerAuthorAvatarEl = document.getElementById('reader-author-avatar');
  const readerAbstractEl = document.getElementById('reader-abstract');
  const readerTakeawaysContainer = document.getElementById('reader-takeaways-container');
  const readerTakeawaysList = document.getElementById('reader-takeaways-list');
  const readerBodyContentEl = document.getElementById('reader-body-content');
  const readerMethodologyEl = document.getElementById('reader-methodology');
  const readerDisclaimerEl = document.getElementById('reader-disclaimer');
  const readerCopyLinkBtn = document.getElementById('reader-copy-link-btn');
  const readerPrintBtn = document.getElementById('reader-print-btn');
  const readerBottomBackBtn = document.getElementById('reader-bottom-back-btn');

  // Upload Modal elements
  const uploadModal = document.getElementById('upload-paper-modal');
  const openUploadModalBtn = document.getElementById('open-upload-modal-btn');
  const closeUploadModalBtn = document.getElementById('close-upload-modal-btn');
  const uploadPaperForm = document.getElementById('upload-paper-form');
  const exportJsonBtn = document.getElementById('export-json-btn');
  const successToast = document.getElementById('research-toast');

  // Toast notification helper
  function showToast(message) {
    if (!successToast) return;
    successToast.textContent = message;
    successToast.classList.add('show');
    setTimeout(() => {
      successToast.classList.remove('show');
    }, 3200);
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  function formatDateDisplay(dateVal) {
    if (!dateVal) {
      const now = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return String(dateVal);
  }

  /**
   * Normalizes incoming raw paper data so all components can render gracefully
   * even if fields were missing in the uploaded JSON.
   */
  function normalizePaper(raw) {
    if (!raw) return null;
    const title = (raw.title || 'Publikasi Riset Almere').trim();
    const slug = raw.slug || slugify(title) || `research-${Date.now()}`;
    const id = raw.id || slug;
    // Default category to 'Macro' if missing or blank
    const category = (raw.category && raw.category.trim()) ? raw.category.trim() : 'Macro';
    const date = raw.date || formatDateDisplay(raw.publication_date || raw.timestamp);
    const author = raw.author || raw.brand || 'Almere Research Team';

    // Abstract extraction fallback
    let abstract = raw.abstract || '';
    if (!abstract && Array.isArray(raw.sections)) {
      const summarySec = raw.sections.find(s =>
        s.heading && (
          s.heading.toLowerCase().includes('ringkasan') ||
          s.heading.toLowerCase().includes('abstract') ||
          s.heading.toLowerCase().includes('summary')
        )
      );
      if (summarySec && typeof summarySec.content === 'string') {
        abstract = summarySec.content;
      } else if (raw.sections[0] && typeof raw.sections[0].content === 'string') {
        abstract = raw.sections[0].content;
      }
    }

    // Key takeaways extraction fallback
    let keyTakeaways = raw.keyTakeaways;
    if (!Array.isArray(keyTakeaways) && Array.isArray(raw.sections)) {
      const findingsSec = raw.sections.find(s =>
        s.heading && (
          s.heading.toLowerCase().includes('temuan') ||
          s.heading.toLowerCase().includes('takeaway') ||
          s.heading.toLowerCase().includes('poin')
        )
      );
      if (findingsSec && Array.isArray(findingsSec.content)) {
        keyTakeaways = findingsSec.content.map(String);
      }
    }

    // Methodology extraction fallback
    let methodology = raw.methodology || '';
    if (!methodology && Array.isArray(raw.sections)) {
      const methSec = raw.sections.find(s =>
        s.heading && (
          s.heading.toLowerCase().includes('metodologi') ||
          s.heading.toLowerCase().includes('sumber')
        )
      );
      if (methSec) {
        if (typeof methSec.content === 'string') {
          methodology = methSec.content;
        } else if (Array.isArray(methSec.content)) {
          methodology = methSec.content.map(item => item.name ? `${item.name} (${item.title || ''})` : String(item)).join('; ');
        }
      }
    }

    const disclaimer = raw.disclaimer || raw.disclosure || 'Dokumen ini merupakan riset independen Almere & Co berdasarkan data publik. Bukan merupakan saran investasi atau rekomendasi finansial.';

    return {
      id,
      slug,
      title,
      subtitle: raw.subtitle || '',
      category,
      date,
      publication_date: raw.publication_date || '',
      timestamp: raw.timestamp || Date.now(),
      readTime: raw.readTime || '8 min read',
      author,
      abstract,
      keyTakeaways: Array.isArray(keyTakeaways) ? keyTakeaways : [],
      sections: Array.isArray(raw.sections) ? raw.sections : [],
      rawContent: raw.rawContent || '',
      methodology: methodology || 'Data internal dan riset independen Almere & Co.',
      disclaimer
    };
  }

  // --- 1. LOAD RESEARCH PAPERS ---
  async function loadResearchPapers() {
    try {
      const response = await fetch('data/research_papers.json?v=' + Date.now());
      if (response.ok) {
        const rawList = await response.json();
        allPapers = (Array.isArray(rawList) ? rawList : [rawList])
          .map(normalizePaper)
          .filter(Boolean);
      } else {
        console.warn('Could not fetch data/research_papers.json, using fallback');
        allPapers = [];
      }
    } catch (e) {
      console.warn('Fetch error:', e);
      allPapers = [];
    }

    // Merge any user-uploaded custom papers from localStorage
    try {
      const stored = localStorage.getItem('almere_custom_research_papers');
      if (stored) {
        const customPapers = JSON.parse(stored);
        if (Array.isArray(customPapers)) {
          const existingIds = new Set(allPapers.map(p => p.id));
          customPapers.forEach(cp => {
            const normalized = normalizePaper(cp);
            if (normalized && !existingIds.has(normalized.id)) {
              allPapers.unshift(normalized);
            }
          });
        }
      }
    } catch (err) {
      console.error('Error loading custom papers from localStorage:', err);
    }

    renderPaperList();
    handleInitialRoute();
  }

  // --- 2. RENDER PAPERS LIST ---
  function renderPaperList() {
    if (!researchListEl) return;
    researchListEl.innerHTML = '';

    const filtered = allPapers.filter(paper => {
      if (activeCategory === 'All') return true;
      const cat = (paper.category || 'Macro').trim().toLowerCase();
      return cat === activeCategory.toLowerCase();
    });

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'research-empty-state';
      empty.textContent = `Belum ada publikasi riset untuk kategori "${activeCategory}".`;
      researchListEl.appendChild(empty);
      return;
    }

    filtered.forEach(paper => {
      const item = document.createElement('div');
      item.className = 'research-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('data-id', paper.id);
      item.setAttribute('data-slug', paper.slug || paper.id);

      item.innerHTML = `
        <div class="research-item-left">
          <h3 class="research-item-title">${escapeHtml(paper.title)}</h3>
          <div class="research-item-meta">
            <span class="meta-cat">${escapeHtml(paper.category || 'Macro')}</span>
            <span class="meta-dot">&middot;</span>
            <span class="meta-date">${escapeHtml(paper.date || '')}</span>
            <span class="meta-dot">&middot;</span>
            <span class="meta-readtime">${escapeHtml(paper.readTime || '6 min read')}</span>
          </div>
        </div>
        <div class="research-item-arrow" aria-hidden="true">&rarr;</div>
      `;

      item.addEventListener('click', () => {
        openPaperReader(paper.id);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPaperReader(paper.id);
        }
      });

      researchListEl.appendChild(item);
    });
  }

  // --- 3. FILTER TABS INTERACTION ---
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('active');
        p.setAttribute('aria-selected', 'false');
      });
      pill.classList.add('active');
      pill.setAttribute('aria-selected', 'true');
      activeCategory = pill.getAttribute('data-category') || 'Macro';
      renderPaperList();
    });
  });

  /**
   * Formats section content dynamically depending on its type:
   * string, array of strings, scenario cards, indicator table, or source links.
   */
  function renderSectionContent(content) {
    if (!content) return '';

    // 1. Plain text or HTML string
    if (typeof content === 'string') {
      if (content.includes('<p>') || content.includes('<div>') || content.includes('<ul>')) {
        return content;
      }
      return content
        .split('\n\n')
        .filter(p => p.trim().length > 0)
        .map(p => `<p>${escapeHtml(p.trim())}</p>`)
        .join('');
    }

    // 2. Array of items
    if (Array.isArray(content)) {
      if (content.length === 0) return '';

      // Case A: Array of simple strings -> styled bullet list
      if (typeof content[0] === 'string') {
        return `
          <ul class="paper-bullet-list">
            ${content.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        `;
      }

      // Case B: Array of scenarios: [{ name, description }]
      if (content[0].name && content[0].description) {
        return `
          <div class="paper-scenario-grid">
            ${content.map((item, idx) => `
              <div class="paper-scenario-card">
                <div class="scenario-badge">Skenario ${idx + 1}</div>
                <h4 class="scenario-title">${escapeHtml(item.name)}</h4>
                <p class="scenario-desc">${escapeHtml(item.description)}</p>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Case C: Array of monitor indicators: [{ indicator, monitor, bearish_confirmation }]
      if (content[0].indicator) {
        return `
          <div class="paper-table-wrap">
            <table class="paper-table">
              <thead>
                <tr>
                  <th style="width: 26%;">Indikator</th>
                  <th style="width: 38%;">Metrik yang Dipantau</th>
                  <th style="width: 36%;">Konfirmasi Pelemahan / Risiko</th>
                </tr>
              </thead>
              <tbody>
                ${content.map(row => `
                  <tr>
                    <td class="td-indicator"><strong>${escapeHtml(row.indicator)}</strong></td>
                    <td>${escapeHtml(row.monitor || '-')}</td>
                    <td class="td-bearish">${escapeHtml(row.bearish_confirmation || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      // Case D: Array of references/sources: [{ name, title, url }]
      if (content[0].url || (content[0].name && content[0].title)) {
        return `
          <ul class="paper-source-list">
            ${content.map(src => `
              <li>
                <a href="${escapeHtml(src.url || '#')}" target="_blank" rel="noopener noreferrer">
                  <span class="source-inst">${escapeHtml(src.name || '')}</span>
                  <span class="source-title">${escapeHtml(src.title || src.url || '')}</span>
                  <span class="source-icon">&rarr;</span>
                </a>
              </li>
            `).join('')}
          </ul>
        `;
      }

      // Fallback for other object arrays
      return `
        <div class="paper-generic-list">
          ${content.map(obj => `
            <div class="paper-scenario-card" style="margin-bottom: 12px;">
              ${Object.entries(obj).map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}`).join('<br>')}
            </div>
          `).join('')}
        </div>
      `;
    }

    return `<p>${escapeHtml(String(content))}</p>`;
  }

  // --- 4. PAPER READER VIEW LOGIC ---
  function openPaperReader(paperId, updateHistory = true) {
    const paper = allPapers.find(p => p.id === paperId || p.slug === paperId);
    if (!paper) return;

    currentOpenPaperId = paper.id;

    // Populate Reader Fields
    if (readerCategoryPill) readerCategoryPill.textContent = paper.category || 'Macro';
    if (readerDateEl) readerDateEl.textContent = paper.date || '';
    if (readerTimeEl) readerTimeEl.textContent = paper.readTime || '6 min read';
    if (readerTitleEl) readerTitleEl.textContent = paper.title || '';
    if (readerSubtitleEl) {
      if (paper.subtitle) {
        readerSubtitleEl.textContent = paper.subtitle;
        readerSubtitleEl.style.display = 'block';
      } else {
        readerSubtitleEl.style.display = 'none';
      }
    }
    if (readerAuthorEl) readerAuthorEl.textContent = paper.author || 'Almere Research Team';
    if (readerAuthorAvatarEl) {
      const initial = (paper.author || 'A').trim().charAt(0).toUpperCase();
      readerAuthorAvatarEl.textContent = initial;
    }
    if (readerAbstractEl) {
      readerAbstractEl.textContent = paper.abstract || '';
    }

    // Key Takeaways
    if (readerTakeawaysContainer && readerTakeawaysList) {
      if (Array.isArray(paper.keyTakeaways) && paper.keyTakeaways.length > 0) {
        readerTakeawaysList.innerHTML = '';
        paper.keyTakeaways.forEach(point => {
          const li = document.createElement('li');
          li.textContent = point;
          readerTakeawaysList.appendChild(li);
        });
        readerTakeawaysContainer.style.display = 'block';
      } else {
        readerTakeawaysContainer.style.display = 'none';
      }
    }

    // Sections & Body Content
    if (readerBodyContentEl) {
      readerBodyContentEl.innerHTML = '';
      if (Array.isArray(paper.sections) && paper.sections.length > 0) {
        paper.sections.forEach(sec => {
          const secWrapper = document.createElement('div');
          secWrapper.className = 'paper-section-block';
          secWrapper.innerHTML = `
            <h2>${escapeHtml(sec.heading)}</h2>
            ${renderSectionContent(sec.content)}
          `;
          readerBodyContentEl.appendChild(secWrapper);
        });
      } else if (paper.rawContent) {
        readerBodyContentEl.innerHTML = paper.rawContent;
      }
    }

    // Methodology
    if (readerMethodologyEl) {
      readerMethodologyEl.textContent = paper.methodology || 'Data internal dan riset independen Almere & Co.';
    }

    // Disclaimer
    if (readerDisclaimerEl) {
      readerDisclaimerEl.textContent = paper.disclaimer || 'Riset ini bersifat analitis dan bukan merupakan saran investasi.';
    }

    // Show Reader, Hide Index
    if (indexContainer) indexContainer.style.display = 'none';
    if (readerContainer) {
      readerContainer.classList.add('active');
    }

    // Scroll smoothly to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Update URL hash
    if (updateHistory) {
      const targetHash = '#' + (paper.slug || paper.id);
      if (window.location.hash !== targetHash) {
        history.pushState({ paperId: paper.id }, '', targetHash);
      }
    }
  }

  function closePaperReader(updateHistory = true) {
    currentOpenPaperId = null;
    if (readerContainer) readerContainer.classList.remove('active');
    if (indexContainer) indexContainer.style.display = 'block';

    if (updateHistory && window.location.hash) {
      history.pushState(null, '', window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Routing Handler for initial load and popstate
  function handleInitialRoute() {
    const hash = window.location.hash.replace(/^#/, '');
    if (hash) {
      const paper = allPapers.find(p => p.id === hash || p.slug === hash);
      if (paper) {
        openPaperReader(paper.id, false);
        return;
      }
    }
    closePaperReader(false);
  }

  window.addEventListener('popstate', () => {
    handleInitialRoute();
  });

  if (readerBackBtn) {
    readerBackBtn.addEventListener('click', () => closePaperReader(true));
  }
  if (readerBottomBackBtn) {
    readerBottomBackBtn.addEventListener('click', () => closePaperReader(true));
  }

  // Copy Link Action
  if (readerCopyLinkBtn) {
    readerCopyLinkBtn.addEventListener('click', () => {
      const url = window.location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          showToast('✓ Tautan riset berhasil disalin ke clipboard');
        }).catch(() => {
          prompt('Salin tautan riset berikut:', url);
        });
      } else {
        prompt('Salin tautan riset berikut:', url);
      }
    });
  }

  // Print Action
  if (readerPrintBtn) {
    readerPrintBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // --- 5. UPLOAD & PUBLISH RESEARCH PAPER MODAL ---
  if (openUploadModalBtn) {
    openUploadModalBtn.addEventListener('click', () => {
      if (uploadModal) {
        uploadModal.classList.add('active');
        uploadModal.setAttribute('aria-hidden', 'false');
      }
    });
  }

  if (closeUploadModalBtn) {
    closeUploadModalBtn.addEventListener('click', () => {
      if (uploadModal) {
        uploadModal.classList.remove('active');
        uploadModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  if (uploadModal) {
    uploadModal.addEventListener('click', (e) => {
      if (e.target === uploadModal) {
        uploadModal.classList.remove('active');
        uploadModal.setAttribute('aria-hidden', 'true');
      }
    });
  }

  // Handle Form Submission
  if (uploadPaperForm) {
    uploadPaperForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const title = document.getElementById('paper-input-title').value.trim();
      const category = document.getElementById('paper-input-category').value.trim();
      const readTime = document.getElementById('paper-input-readtime').value.trim() || '7 min read';
      const author = document.getElementById('paper-input-author').value.trim() || 'Farel Arya Priguna (Founder & Ex J.P. Morgan)';
      const abstract = document.getElementById('paper-input-abstract').value.trim();
      const rawContent = document.getElementById('paper-input-content').value.trim();

      if (!title || !abstract || !rawContent) {
        alert('Mohon lengkapi judul, ringkasan eksekutif, dan konten riset.');
        return;
      }

      // Generate date & slug
      const now = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const dateStr = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
      const id = slug || 'research-' + Date.now();

      // Format simple paragraph content
      const formattedContent = rawContent
        .split('\n\n')
        .filter(p => p.trim().length > 0)
        .map(p => {
          if (p.startsWith('# ')) {
            return `<h2>${escapeHtml(p.replace('# ', ''))}</h2>`;
          } else if (p.startsWith('## ')) {
            return `<h3>${escapeHtml(p.replace('## ', ''))}</h3>`;
          }
          return `<p>${escapeHtml(p)}</p>`;
        })
        .join('');

      const newPaper = normalizePaper({
        id,
        slug,
        title,
        subtitle: 'Publikasi Riset Mandiri Almere & Co',
        category: category || 'Macro',
        date: dateStr,
        timestamp: Date.now(),
        readTime,
        author,
        status: 'Published',
        abstract,
        keyTakeaways: [
          'Publikasi riset ini telah diverifikasi dan disetujui oleh tim tata kelola Almere & Co.',
          'Data dan analisis disusun berdasarkan metodologi yang dapat ditinjau oleh publik.'
        ],
        sections: [
          {
            heading: '1. Uraian & Analisis Riset',
            content: formattedContent
          }
        ],
        methodology: 'Riset mandiri dan observasi pasar internal Almere & Co.',
        disclaimer: 'Publikasi ini disediakan semata-mata untuk tujuan edukasi dan transparansi riset internal Almere & Co.'
      });

      // 1. Try to POST to backend API if available
      try {
        await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPaper)
        });
      } catch (err) {
        // Backend not running or static host, ignore
      }

      // 2. Save to localStorage
      try {
        let stored = [];
        const existing = localStorage.getItem('almere_custom_research_papers');
        if (existing) stored = JSON.parse(existing);
        stored.unshift(newPaper);
        localStorage.setItem('almere_custom_research_papers', JSON.stringify(stored));
      } catch (err) {
        console.error('LocalStorage write error:', err);
      }

      // 3. Add to in-memory list
      allPapers.unshift(newPaper);
      renderPaperList();

      // Close modal
      uploadModal.classList.remove('active');
      uploadModal.setAttribute('aria-hidden', 'true');
      uploadPaperForm.reset();

      showToast('✓ Riset berhasil diterbitkan! Membuka paper...');
      setTimeout(() => {
        openPaperReader(newPaper.id, true);
      }, 600);
    });
  }

  // Export JSON helper for the user
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allPapers, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', 'research_papers.json');
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('✓ File research_papers.json berhasil diunduh!');
    });
  }

  // --- 6. INITIALIZE ---
  loadResearchPapers();
})();
