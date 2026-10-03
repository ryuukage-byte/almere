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

  // --- 1. LOAD RESEARCH PAPERS ---
  async function loadResearchPapers() {
    try {
      const response = await fetch('data/research_papers.json?v=' + Date.now());
      if (response.ok) {
        allPapers = await response.json();
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
          // Prepend custom papers
          const existingIds = new Set(allPapers.map(p => p.id));
          customPapers.forEach(cp => {
            if (!existingIds.has(cp.id)) {
              allPapers.unshift(cp);
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
      return (paper.category || '').toLowerCase() === activeCategory.toLowerCase();
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

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 3. FILTER TABS INTERACTION ---
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.getAttribute('data-category') || 'Macro';
      renderPaperList();
    });
  });

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
            ${sec.content}
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

      const newPaper = {
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
      };

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
