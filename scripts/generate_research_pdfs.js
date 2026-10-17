/**
 * Script to generate high-fidelity, institutional-grade PDF research reports
 * for Almere & Co from data/research_papers.json
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const dataPath = path.join(__dirname, '..', 'data', 'research_papers.json');
const outputDir = path.join(__dirname, '..', 'assets', 'research');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const rawData = fs.readFileSync(dataPath, 'utf8');
const papers = JSON.parse(rawData);

function cleanHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<strong>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<em>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/&middot;/gi, '·')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function generatePaperPdf(paper) {
  return new Promise((resolve, reject) => {
    const slug = paper.slug || paper.id;
    const filename = `${slug}.pdf`;
    const destPath = path.join(outputDir, filename);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 50, left: 52, right: 52 },
      bufferPages: true
    });

    const stream = fs.createWriteStream(destPath);
    doc.pipe(stream);

    // --- COVER / HEADER ---
    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .fillColor('#0b0f19')
      .text('ALMERE & CO', { continued: true })
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#64748b')
      .text('   |   INSTITUTIONAL RESEARCH & MARKET STRATEGY');

    doc
      .moveTo(52, doc.y + 6)
      .lineTo(543, doc.y + 6)
      .strokeColor('#cbd5e1')
      .lineWidth(1)
      .stroke();

    doc.moveDown(1.2);

    // Metadata line (Category, Date, Read Time)
    const cat = (paper.category || 'Macro').toUpperCase();
    const dateStr = paper.date || '2026';
    const readTime = paper.readTime || '8 min read';

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#b91c1c')
      .text(cat, { continued: true })
      .font('Helvetica')
      .fillColor('#64748b')
      .text(`  ·  ${dateStr}  ·  ${readTime}`);

    doc.moveDown(0.6);

    // Main Title
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#0f172a')
      .text(paper.title, { lineGap: 3 });

    // Subtitle
    if (paper.subtitle) {
      doc.moveDown(0.4);
      doc
        .fontSize(11)
        .font('Helvetica-Oblique')
        .fillColor('#334155')
        .text(paper.subtitle, { lineGap: 2 });
    }

    doc.moveDown(0.8);

    // Author byline box
    const author = paper.author || 'Almere Research Team';
    doc
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .fillColor('#1e293b')
      .text(`Penulis: ${author}`)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#64748b')
      .text('Divisi Strategi Makro & Riset Kuantitatif Almere & Co · Peer Reviewed');

    doc.moveDown(1);

    // Abstract Box
    if (paper.abstract) {
      const cleanAbstract = cleanHtml(paper.abstract);
      const absY = doc.y;
      
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor('#475569')
        .text('EXECUTIVE SUMMARY & ABSTRACT', 64, absY + 10);
      
      doc.moveDown(0.3);
      doc
        .fontSize(9.5)
        .font('Helvetica')
        .fillColor('#1e293b')
        .text(cleanAbstract, 64, doc.y, {
          width: 467,
          align: 'justify',
          lineGap: 3
        });
      
      const absHeight = doc.y - absY + 12;
      
      // Draw background and left border behind
      doc.save();
      doc
        .rect(52, absY, 491, absHeight)
        .fillColor('#f8fafc')
        .fill();
      
      doc
        .rect(52, absY, 4, absHeight)
        .fillColor('#b91c1c')
        .fill();
      doc.restore();

      // Reposition text over the background
      doc.y = absY + absHeight + 14;
      doc.x = 52;
    }

    // Key Takeaways Box
    if (Array.isArray(paper.keyTakeaways) && paper.keyTakeaways.length > 0) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('Poin Kunci & Temuan Utama (Key Takeaways):');

      doc.moveDown(0.5);

      paper.keyTakeaways.forEach((item, idx) => {
        const text = typeof item === 'string' ? item : (item.description || item.title || '');
        doc
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .fillColor('#b91c1c')
          .text(`[${idx + 1}] `, 62, doc.y, { continued: true })
          .font('Helvetica')
          .fillColor('#334155')
          .text(cleanHtml(text), { width: 470, lineGap: 2 });
        doc.moveDown(0.4);
      });

      doc.moveDown(0.8);
      doc.x = 52;
    }

    // Sections & Body
    if (Array.isArray(paper.sections)) {
      paper.sections.forEach((sec) => {
        // Section Header
        doc.moveDown(0.6);
        doc
          .fontSize(12)
          .font('Helvetica-Bold')
          .fillColor('#0f172a')
          .text(sec.heading);

        doc
          .moveTo(52, doc.y + 3)
          .lineTo(240, doc.y + 3)
          .strokeColor('#e2e8f0')
          .lineWidth(1)
          .stroke();

        doc.moveDown(0.6);

        // Section Content
        if (typeof sec.content === 'string') {
          doc
            .fontSize(9.5)
            .font('Helvetica')
            .fillColor('#334155')
            .text(cleanHtml(sec.content), {
              width: 491,
              align: 'justify',
              lineGap: 3.5
            });
        } else if (Array.isArray(sec.content)) {
          sec.content.forEach((item) => {
            if (typeof item === 'string') {
              doc
                .fontSize(9.5)
                .font('Helvetica')
                .fillColor('#334155')
                .text(`•  ${cleanHtml(item)}`, {
                  indent: 10,
                  width: 480,
                  lineGap: 2
                });
              doc.moveDown(0.3);
            } else if (item.name && item.description) {
              doc
                .fontSize(9.5)
                .font('Helvetica-Bold')
                .fillColor('#1e293b')
                .text(`Skenario: ${item.name}`, { indent: 10 });
              doc
                .fontSize(9)
                .font('Helvetica')
                .fillColor('#475569')
                .text(cleanHtml(item.description), {
                  indent: 20,
                  width: 470,
                  lineGap: 2
                });
              doc.moveDown(0.4);
            }
          });
        }
      });
    }

    // Methodology
    if (paper.methodology) {
      doc.moveDown(1);
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#475569')
        .text('METODOLOGI & SUMBER DATA');
      doc
        .fontSize(8.5)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(cleanHtml(paper.methodology), { width: 491, lineGap: 2 });
    }

    // Disclaimer
    doc.moveDown(1);
    doc
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor('#dc2626')
      .text('LEGAL & FINANCIAL DISCLAIMER');
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#94a3b8')
      .text(
        paper.disclaimer ||
          'Publikasi ini merupakan hasil riset internal Almere & Co dan ditujukan semata-mata untuk keperluan informasi dan edukasi. Bukan merupakan nasihat keuangan atau penawaran resmi.',
        { width: 491, lineGap: 1.5 }
      );

    // --- RUNNING FOOTER ON ALL PAGES ---
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      
      // Top header (pages > 0)
      if (i > 0) {
        doc
          .fontSize(7.5)
          .font('Helvetica')
          .fillColor('#94a3b8')
          .text(`ALMERE & CO · ${paper.title.toUpperCase()}`, 52, 28, {
            width: 491,
            align: 'left'
          });
        doc
          .moveTo(52, 40)
          .lineTo(543, 40)
          .strokeColor('#f1f5f9')
          .lineWidth(0.5)
          .stroke();
      }

      // Bottom footer
      doc
        .moveTo(52, 792)
        .lineTo(543, 792)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94a3b8')
        .text('Almere & Co Institutional Research — Read Only Official Publication', 52, 802, {
          width: 380,
          align: 'left'
        });

      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#64748b')
        .text(`Halaman ${i + 1} dari ${range.count}`, 440, 802, {
          width: 103,
          align: 'right'
        });
    }

    doc.end();

    stream.on('finish', () => {
      resolve(`assets/research/${filename}`);
    });
    stream.on('error', reject);
  });
}

async function main() {
  console.log(`Menghasilkan PDF untuk ${papers.length} artikel riset...`);
  for (const paper of papers) {
    const relPath = await generatePaperPdf(paper);
    paper.pdfUrl = relPath;
    console.log(`✓ Berhasil dibuat: ${relPath}`);
  }

  // Update data/research_papers.json with pdfUrl links
  fs.writeFileSync(dataPath, JSON.stringify(papers, null, 2), 'utf8');
  console.log('✓ data/research_papers.json berhasil diperbarui dengan pdfUrl!');
}

main().catch(console.error);
