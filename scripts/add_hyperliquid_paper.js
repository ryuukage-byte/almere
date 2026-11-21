const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'data', 'research_papers.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const papers = JSON.parse(rawData);

const hyperliquidPaper = {
  id: "hyperliquid-hip3-tokenization-value-capture",
  slug: "hyperliquid-hip3-tokenization-value-capture",
  title: "Hyperliquid: HIP-3, Tokenisasi Aset, Institusi Keuangan, dan Potensi Value Capture HYPE",
  subtitle: "Evolusi dari Crypto Perpetual Venue Menjadi Lapisan Perdagangan Multi-Aset On-Chain",
  category: "Markets",
  date: "20 Nov 2026",
  publication_date: "2026-11-20",
  timestamp: 1795132800000,
  readTime: "15 min read",
  author: "Almere Research Team",
  brand: "Almere&Co",
  language: "id",
  status: "Published",
  abstract: "Hyperliquid berpotensi berevolusi dari crypto perpetual venue menjadi lapisan perdagangan multi-aset on-chain. HIP-3 adalah katalis penting karena memungkinkan builder eksternal menciptakan pasar perpetual untuk saham, indeks, komoditas, FX, dan referensi pre-IPO. Namun, perdagangan synthetic exposure, kepemilikan tokenized asset, penerbitan IPO, dan revenue protokol adalah hal yang berbeda. Laporan riset independen ini membedah arsitektur teknis HIP-1/2/3, bukti empiris adopsi pasar, implikasi kemitraan institusional ICE-Trade[XYZ], dinamika pasar pre-IPO, mekanisme transmisi revenue protokol menuju Assistance Fund, valuasi treasury PURR di Nasdaq, serta skenario dan conviction framework hingga tahun 2029.",
  keyTakeaways: [
    "HIP-3 telah membuktikan aktivitas material: Snapshot 20 Nov 2026 mencatat 174 pasar live di 10 venue dengan volume 24 jam $6,89B dan open interest (OI) $4,27B. Pada 19 Nov 2026, HIP-3 menyumbang 48,6% dari total volume harian Hyperliquid ($13,7B).",
    "HIP-3 bukan spot dan bukan IPO: HIP-3 adalah framework builder-deployed perpetual futures. Kontrak perpetual yang mereferensikan saham atau perusahaan pre-IPO (seperti ANT) tidak memberikan hak kepemilikan saham riil, hak suara, maupun dividen.",
    "Katalis institusional paling konkret adalah aliansi ICE–Trade[XYZ]: Pada 29 Okt 2026, Intercontinental Exchange (induk NYSE) dan Trade[XYZ] mengumumkan rencana membawa pasar perpetual berbasis Hyperliquid ke struktur pasar dan kliring teregulasi AS (menunggu izin regulator).",
    "Tokenisasi dan perdagangan adalah lapisan berbeda: Institusi dapat menerbitkan tokenized securities di satu jaringan, sedangkan order book sekunder, kustodi, dan kepatuhan berada di lapisan lain. Hyperliquid dapat menjadi venue perdagangan, bukan otomatis issuer atau pemilik underlying.",
    "Value capture HYPE masuk akal tetapi tidak otomatis: Staking deployer HIP-3 memerlukan 500.000 HYPE dan 99% net protocol fee dialokasikan ke Assistance Fund untuk pembelian pasar HYPE secara berkelanjutan, namun emisi suplai, unlock, dan pembagian fee builder harus dipisahkan.",
    "PURR adalah kendaraan treasury korporat di Nasdaq: SEC filing Q3 2026 Hyperliquid Strategies Inc. mencatat holding 38,52 juta HYPE dan $254,6 juta kas tanpa utang. Kinerjanya dipengaruhi langsung oleh harga pasar HYPE, penerbitan saham, dan premi/diskon terhadap NAV (mNAV)."
  ],
  sections: [
    {
      heading: "Panduan Membaca Laporan & Kerangka Evaluasi",
      content: `<p>Laporan riset ini bersifat analitis dan informasional, bukan rekomendasi membeli atau menjual HYPE, PURR, maupun aset lainnya. Data on-chain dan kondisi pasar aset digital bergerak dinamis. Seluruh hasil kalkulasi ditandai secara eksplisit; skenario bukan merupakan ramalan pasti dan tidak menjamin hasil investasi.</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 28%;">Label</th>
        <th style="width: 72%;">Makna &amp; Batasan Analisis</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>Data terlapor</strong></td>
        <td>Angka resmi yang dinyatakan oleh sumber primer, regulator (SEC), atau penyedia data resmi.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Hasil perhitungan</strong></td>
        <td>Formulasi matematika yang diturunkan dari data terlapor; bukan angka yang dilaporkan langsung.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Asumsi / skenario</strong></td>
        <td>Input ilustratif untuk uji sensitivitas model; bukan merupakan perkiraan resmi (forecast).</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Hipotesis</strong></td>
        <td>Interpretasi strategis fundamental yang masih memerlukan pengujian data berkelanjutan.</td>
      </tr>
    </tbody>
  </table>
</div>`
    },
    {
      heading: "1. Thesis Investasi Utama: Lapisan Likuiditas Multi-Aset On-Chain",
      content: `<p>Formulasi thesis paling kuat bukanlah spekulasi bahwa <em>"semua IPO tradisional akan listing di Hyperliquid"</em>. Formulasi rasional yang lebih terukur adalah:</p>
<div class="paper-scenario-card" style="margin: 20px 0; border-left: 3px solid #3b82f6; background: rgba(59, 130, 246, 0.04);">
  <p style="font-size: 15px; color: #f8fafc; font-weight: 500; margin: 0; line-height: 1.6;"><strong>Thesis Inti:</strong> Hyperliquid berpotensi menjadi lapisan perdagangan dan likuiditas utama bagi berbagai eksposur aset on-chain, termasuk instrumen derivatif yang mereferensikan aset tradisional (ekuitas, komoditas, valuta asing) dan perusahaan pre-IPO secara 24/7.</p>
</div>
<p>Pertumbuhan tokenisasi global tidak serta merta bertransformasi menjadi pendapatan bagi protokol Hyperliquid. Harus ada integrasi legal, likuiditas, dan aktivitas transaksi nyata yang terjadi di dalam ekosistemnya melalui rantai nilai berikut:</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 15%;">Tahap</th>
        <th style="width: 40%;">Aktor &amp; Fungsi</th>
        <th style="width: 45%;">Implikasi Terhadap Hyperliquid</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>1. Penerbitan</strong></td>
        <td>Issuer, manajer dana, atau korporasi menerbitkan token sekuritas atau instrumen RWA.</td>
        <td>Belum tentu di Hyperliquid; penerbitan primer dapat terjadi di blockchain lain.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>2. Legal &amp; Custody</strong></td>
        <td>Kepatuhan KYC/AML, transfer agent, kustodian teregulasi, dan pembatasan transfer.</td>
        <td>Memerlukan jembatan regulasi dan integrasi teknis sebelum aset dapat digunakan.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>3. Listing Spot</strong></td>
        <td>Token spot yang memenuhi syarat diperdagangkan di buku pesanan (order book).</td>
        <td>HIP-1 menyediakan standar token native dan spot order book; HIP-2 memfasilitasi likuiditas otomatis.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>4. Derivatif</strong></td>
        <td>Builder eksternal meluncurkan perpetual futures yang mereferensikan harga aset.</td>
        <td>HIP-3 menyediakan kerangka kerja pembentukan pasar perpetual independen tanpa izin validator.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>5. Trading &amp; Collateral</strong></td>
        <td>Trader dan market maker menyetor agunan (collateral) dan mengeksekusi volume.</td>
        <td>Mendorong lonjakan volume nosional, open interest (OI), dan kebutuhan agunan USDC.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>6. Value Capture</strong></td>
        <td>Fee perdagangan didistribusikan antara deployer builder dan protokol.</td>
        <td>Sebagian fee protokol yang memenuhi syarat dialokasikan untuk mengakuisisi HYPE di pasar sekunder.</td>
      </tr>
    </tbody>
  </table>
</div>`
    },
    {
      heading: "2. Arsitektur Teknis: HIP-1, HIP-2, HIP-3 dan HyperEVM",
      content: `<p>Ekosistem Hyperliquid dibangun di atas infrastruktur performa tinggi HyperCore dengan diferensiasi komponen yang tegas:</p>
<ul class="paper-bullet-list">
  <li><strong>HIP-1 (Native Token Standard &amp; Spot Order Books):</strong> Memfasilitasi penerbitan token fungible native dengan pasokan terbatas (capped supply) serta order book spot on-chain. Dokumentasi protokol merinci pola penerapan aset eksternal termasuk tokenized RWA dan stablecoin melalui bridging atau mekanisme minting khusus. Hal ini tidak otomatis menjamin klaim legal kepemilikan atas aset underlying.</li>
  <li><strong>HIP-2 (Hyperliquidity):</strong> Algoritma penyediaan likuiditas on-chain otomatis untuk pasangan spot melawan USDC, dirancang membantu bootstrap likuiditas awal bagi token HIP-1. HIP-2 beroperasi khusus pada pasar spot dan bukan instrumen derivatif.</li>
  <li><strong>HIP-3 (Builder-Deployed Perpetuals):</strong> Kerangka desentralisasi di mana pihak pembangun (builder) bertanggung jawab penuh atas konfigurasi pasar, pemilihan oracle harga, parameter leverage, margin maintenance, dan penyelesaian (settlement), dengan tetap mewarisi eksekusi mesin HyperCore.</li>
  <li><strong>HyperEVM:</strong> Lapisan komputasi smart contract kompatibel dengan EVM untuk memperluas fungsi DeFi dan aplikasi terdesentralisasi, namun bukan berarti seluruh regulasi institusional otomatis terpenuhi tanpa audit dan perizinan.</li>
</ul>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 22%;">Komponen</th>
        <th style="width: 38%;">Kapabilitas yang Disediakan</th>
        <th style="width: 40%;">Keterbatasan (Bukan Berarti)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>HIP-1</strong></td>
        <td>Token native on-chain + buku pesanan spot.</td>
        <td>Bukan jaminan bahwa semua token mewakili klaim legal yang terlindungi.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>HIP-2</strong></td>
        <td>Bootstrapping likuiditas otomatis untuk pair spot USDC.</td>
        <td>Bukan likuiditas tanpa risiko kerugian permanen atau pengganti total market maker.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>HIP-3</strong></td>
        <td>Pasar perpetual futures yang dideploy oleh builder eksternal.</td>
        <td>Bukan pembelian saham underlying fisik, bukan hak suara pemegang saham, dan bukan IPO.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>HyperEVM</strong></td>
        <td>Lingkungan eksekusi smart contract dan logika program terdesentralisasi.</td>
        <td>Bukan interoperabilitas instan semua aset tanpa perlunya audit, perizinan, dan jembatan.</td>
      </tr>
    </tbody>
  </table>
</div>
<h3 style="font-size: 16px; color: #f1f5f9; margin: 24px 0 12px; font-weight: 600;">Staking HIP-3 dan Parameter Deployment</h3>
<p>Berdasarkan dokumentasi resmi HIP-3 yang diakses, deployer diwajibkan mengunci stake mainnet sebesar <strong>500.000 HYPE</strong> per deployer, dengan batasan satu platform perp DEX per deployer. Stake ini dipertahankan bahkan setelah pasar dihentikan selama durasi tertentu guna menjamin integritas pasar.</p>
<p>Model ekonomi deployer menetapkan bagi hasil fee (fee share) sebesar 50% bagi deployer, dengan tarif fee pengguna ditetapkan 2x lipat dibanding pasar validator biasa sehingga net protocol fee tetap identik. Komponen oracle merupakan titik kritis risiko: feed harga harus mereferensikan aset yang likuid dan sulit dimanipulasi; kelalaian dapat berujung pada pemotongan agunan (slashing) dalam kondisi settlement ekstrem.</p>`
    },
    {
      heading: "3. Bukti Empiris Adopsi HIP-3 & Likuiditas Pasar",
      content: `<p>Aktivitas perdagangan HIP-3 telah melampaui fase eksperimen roadmap dan bertransformasi menjadi pendorong volume dominan bagi Hyperliquid:</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 30%;">Metrik Registry (20 Nov 2026)</th>
        <th style="width: 25%;">Nilai Terlapor</th>
        <th style="width: 45%;">Interpretasi Analitis</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>Builder Venues</strong></td>
        <td>10 Venue</td>
        <td>Ekosistem tidak lagi terpusat pada satu tim pengembang.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Pasar HIP-3 Aktif</strong></td>
        <td>174 Pasar Live</td>
        <td>Mencakup saham AS, indeks global, komoditas, FX, pre-IPO, dan basket tematik.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Volume Perdagangan 24 Jam</strong></td>
        <td>$6,89 Miliar</td>
        <td>Volume nosional kotor transaksi perdagangan, bukan pendapatan protokol.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Open Interest (OI)</strong></td>
        <td>$4,27 Miliar</td>
        <td>Total nilai nosional posisi kontrak terbuka aktif (bukan deposit modal/TVL).</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Pasar Terdelisting</strong></td>
        <td>158 Pasar</td>
        <td>Tingginya dinamika churn/rotasi listing; bagian dari seleksi pasar alamiah.</td>
      </tr>
    </tbody>
  </table>
</div>
<p>Pada 19 November 2026, analisis Keel Research mencatat total volume perdagangan Hyperliquid mencapai $13,7 miliar dengan OI platform $10,7 miliar, di mana pasar HIP-3 berkontribusi sebesar <strong>48,6%</strong> ($6,66 miliar). Ini membuktikan bahwa HIP-3 telah menjadi mesin ekspansi volume terpenting di luar pair kripto konvensional.</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 25%;">Pasar (20 Nov 2026)</th>
        <th style="width: 25%;">Volume 24 Jam</th>
        <th style="width: 25%;">Open Interest (OI)</th>
        <th style="width: 25%;">Pangsa Volume HIP-3</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>ANT · xyz</strong></td>
        <td>$1,75 Miliar</td>
        <td>$257,70 Juta</td>
        <td>25,4%</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>XYZ100 · xyz</strong></td>
        <td>$728,35 Juta</td>
        <td>$325,91 Juta</td>
        <td>10,6%</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>SP500 · xyz</strong></td>
        <td>$707,36 Juta</td>
        <td>$467,67 Juta</td>
        <td>10,3%</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>NVDA · xyz</strong></td>
        <td>$432,75 Juta</td>
        <td>$394,64 Juta</td>
        <td>6,3%</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>SOXL · xyz</strong></td>
        <td>$362,28 Juta</td>
        <td>$44,07 Juta</td>
        <td>5,3%</td>
      </tr>
    </tbody>
  </table>
</div>
<p><strong>Catatan Konsentrasi Pasar:</strong> Tiga pasar teratas (ANT, XYZ100, SP500) menyumbang $3,186 miliar atau 46,2% dari total volume HIP-3 ($6,89B). Meskipun likuiditas masif, kedalaman pasar masih sangat terkonsentrasi pada beberapa instrumen utama. Kontrak <strong>ANT</strong> merupakan instrumen turunan yang mereferensikan valuasi Anthropic, bukan saham riil Anthropic; volume kontrak bukan merupakan bukti penawaran saham publik perdana.</p>`
    },
    {
      heading: "4. Lanskap Tokenisasi Institusional & Katalis ICE–Trade[XYZ]",
      content: `<p>Tokenisasi aset merepresentasikan hak ekonomi atas aset nyata (Treasury AS, money market fund, private credit, saham) di atas ledger digital. Namun, hak legal, penarikan (redemption), dan kustodi ditentukan oleh prospektus produk hukum, bukan semata keberadaan token di blockchain.</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 25%;">Institusi / Platform</th>
        <th style="width: 40%;">Aktivitas Nyata Terlapor</th>
        <th style="width: 35%;">Asumsi yang Belum Terbukti</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>BlackRock / BUIDL</strong></td>
        <td>Tokenized money-market fund yang dikelola melalui Securitize.</td>
        <td>Tidak otomatis dapat diperdagangkan bebas di Hyperliquid.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Franklin Templeton / BENJI</strong></td>
        <td>Tokenized government money-market fund pada public blockchain.</td>
        <td>Penerbitan di satu chain bukan berarti terdaftar di semua bursa on-chain.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Ondo Finance</strong></td>
        <td>Instrumen Treasury tokenized dan eksposur saham sintetis.</td>
        <td>Memerlukan pembuktian integrasi resmi dan likuiditas native di Hyperliquid.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Securitize</strong></td>
        <td>Infrastruktur transfer agent dan kepatuhan penerbitan sekuritas digital.</td>
        <td>Fungsi transfer agent berbeda secara substansial dari bursa derivatif on-chain.</td>
      </tr>
    </tbody>
  </table>
</div>
<h3 style="font-size: 16px; color: #f1f5f9; margin: 24px 0 12px; font-weight: 600;">ICE–Trade[XYZ]: Katalis Institusional Terpenting</h3>
<p>Pada 29 Oktober 2026, <strong>Intercontinental Exchange (ICE)</strong> — induk dari New York Stock Exchange (NYSE) — mengumumkan perjanjian strategis bersama <strong>Trade[XYZ]</strong> untuk membawa pasar perpetual berbasis teknologi Hyperliquid ke dalam arsitektur pasar teregulasi dan kliring resmi di Amerika Serikat.</p>
<p>Dalam kerja sama ini, ICE bertindak sebagai operator eksklusif pasar teregulasi sekaligus melakukan investasi strategis pada Trade[XYZ]. Target produk mencakup eksposur 24/7 terhadap instrumen kripto, ekuitas, komoditas, FX, dan RWA, dengan syarat mutlak mendapatkan izin otoritas pengawas pasar berjangka (CFTC/SEC).</p>
<p><strong>Implikasi Strategis:</strong> ICE secara eksplisit menegaskan bahwa produk perpetual retail ini beroperasi terpisah dari waralaba bursa berjangka institusional milik ICE. Ini bukan berarti NYSE memindahkan pasar saham fisiknya ke Hyperliquid, melainkan aliansi untuk mengombinasikan keunggulan teknologi on-chain HyperCore milik Hyperliquid dengan kekuatan kliring dan kepatuhan regulasi ICE. Investasi ICE pada Trade[XYZ] tidak secara otomatis bernilai sama dengan pembelian langsung token HYPE.</p>`
    },
    {
      heading: "5. Pre-IPO Markets: Mekanisme Kontrak & Realitas Perdagangan",
      content: `<p>Pasar perpetual pre-IPO menawarkan sarana eksposur spekulasi terhadap valuasi emiten privat sebelum mencatatkan saham di bursa resmi. Instrumen ini memiliki perbedaan fundamental dengan proses IPO:</p>
<div class="paper-scenario-card" style="margin: 20px 0; border-left: 3px solid #f59e0b; background: rgba(245, 158, 11, 0.04);">
  <p style="font-size: 14.5px; color: #f8fafc; margin: 0; line-height: 1.6;"><strong>Klarifikasi Yuridis &amp; Finansial:</strong> Kontrak perpetual pre-IPO tidak melibatkan penerbitan saham baru oleh perusahaan, tidak ada penjatahan efek (allotment), tidak ada hak kepemilikan yuridis, dan pemegang kontrak tidak memiliki hak atas dividen atau hak suara pada RUPS.</p>
</div>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 32%;">Kontrak Pre-IPO (19 Nov 2026)</th>
        <th style="width: 34%;">Volume 24 Jam Terlapor</th>
        <th style="width: 34%;">Open Interest (OI)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>Anthropic (xyz:ANT)</strong></td>
        <td>$452 Juta</td>
        <td>$268 Juta</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Anthropic (io:ANTH)</strong></td>
        <td>$77,49 Juta</td>
        <td>$219 Juta</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>OpenAI (io:OAI)</strong></td>
        <td>$1,39 Juta</td>
        <td>$7,3 Juta</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Anthropic (para:ANTH)</strong></td>
        <td>$177 Ribu</td>
        <td>$109 Ribu</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Oura (xyz:OURA)</strong></td>
        <td>$2,43 Ribu</td>
        <td>$591 Ribu</td>
      </tr>
    </tbody>
  </table>
</div>
<p>Data snapshot memperlihatkan bahwa pasar Anthropic jauh lebih likuid dibanding kontrak pre-IPO lainnya. Harga perdagangan mencerminkan konsensus spekulatif trader on-chain, bukan valuasi resmi yang diaudit atau harga pendanaan resmi.</p>
<p><strong>Peluang IPO On-Chain:</strong> Tesis bahwa Hyperliquid dapat menjadi arena <em>price discovery</em> sebelum dan sesudah IPO adalah hipotesis yang layak diuji. Namun, agar pasar pasca-IPO dapat berfungsi efektif, builder memerlukan feed oracle harga pasar sekunder yang sangat tangguh, likuiditas mendalam dari market maker institusional, dan mitigasi ketat terhadap risiko asimetri informasi internal.</p>`
    },
    {
      heading: "6. Revenue Engine: Dari Volume Nosional Menuju Fee Protokol",
      content: `<p>Volume transaksi nosional yang tinggi tidak identik dengan pendapatan kas langsung bagi protokol. Relasi mendasar pendapatan ditentukan oleh:</p>
<div class="paper-scenario-card" style="margin: 18px 0; text-align: center; background: rgba(255, 255, 255, 0.03);">
  <p style="font-family: monospace; font-size: 16px; color: #38bdf8; margin: 0; font-weight: 600;">Revenue / Fee Pool = Notional Trading Volume &times; Effective Fee Rate</p>
</div>
<p>Dengan volume HIP-3 harian sebesar $6,89 miliar pada snapshot 20 Nov 2026, volume tahunan yang disetahunkan (annualized notional) mencapai <strong>$2,515 triliun</strong>. Tabel sensitivitas berikut menunjukkan potensi fee bruto tahunan pada berbagai asumsi fee efektif:</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 25%;">Tarif Fee Efektif</th>
        <th style="width: 35%;">Annualized Fee Pool (Bruto)</th>
        <th style="width: 40%;">Catatan Karakteristik</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>0,5 bps (0,005%)</strong></td>
        <td>$125,8 Juta</td>
        <td>Sensitivitas rendah; dominasi market maker maker rebate tinggi.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>1,0 bps (0,010%)</strong></td>
        <td>$251,5 Juta</td>
        <td>Sensitivitas tengah; estimasi bauran taker dan VIP tiers moderat.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>2,0 bps (0,020%)</strong></td>
        <td>$503,0 Juta</td>
        <td>Sensitivitas tinggi; partisipasi ritel taker aktif tanpa diskon volume.</td>
      </tr>
    </tbody>
  </table>
</div>
<p>Fee pool di atas merupakan nilai ilustratif kotor sebelum dikurangi pembagian fee bagi builder (50% pada HIP-3), diskon volume, dan biaya operasional. Angka ini tidak boleh ditambahkan langsung ke data revenue Hyperliquid historis karena sebagian transaksi HIP-3 telah tercermin dalam agregasi platform.</p>
<h3 style="font-size: 16px; color: #f1f5f9; margin: 24px 0 12px; font-weight: 600;">Data Kinerja Finansial Platform (DeFiLlama Snapshot 19 Nov 2026)</h3>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 40%;">Indikator Keuangan</th>
        <th style="width: 25%;">Nilai Tercatat</th>
        <th style="width: 35%;">Penjelasan &amp; Implikasi</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>30-Day Fees</strong></td>
        <td>$95,32 Juta</td>
        <td>Total biaya transaksi yang dibayarkan trader dalam 30 hari.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>30-Day Protocol Revenue</strong></td>
        <td>$72,65 Juta</td>
        <td>Bagian fee bersih yang menjadi pendapatan resmi protokol.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Trailing-Year Revenue</strong></td>
        <td>$679,89 Juta</td>
        <td>Akumulasi pendapatan protokol 12 bulan terakhir.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Annualized 30-Day Revenue</strong></td>
        <td>$871,8 Juta</td>
        <td>Ekstrapolasi laju pendapatan bulanan ke dalam proyeksi setahun.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>HYPE Spot Price</strong></td>
        <td>$66,40</td>
        <td>Harga pasar spot HYPE saat pencatatan data.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Circulating Market Cap</strong></td>
        <td>$15,769 Miliar</td>
        <td>Kapitalisasi pasar suplai beredar token HYPE.</td>
      </tr>
    </tbody>
  </table>
</div>
<p><strong>Multiple Penilaian Indikatif:</strong> Rasio Market Cap terhadap Trailing Revenue tercatat sebesar <strong>23,2&times;</strong>, dan terhadap Annualized 30-Day Revenue sebesar <strong>18,1&times;</strong>. Sebagai perbandingan analitis, rasio ini merefleksikan valuasi yang wajar di industri teknologi pertumbuhan tinggi, namun tidak dapat disamakan secara legal dengan rasio Price-to-Earnings (P/E) saham karena pemegang token tidak memiliki klaim dividen yuridis.</p>`
    },
    {
      heading: "7. Transmisi Pertumbuhan Ekosistem Menjadi Permintaan Token HYPE",
      content: `<p>Agar ekspansi volume HIP-3 menciptakan nilai nyata bagi token HYPE, mekanisme transmisi ekonomi bekerja melalui tiga jalur utama:</p>
<div class="paper-scenario-grid">
  <div class="paper-scenario-card">
    <div class="scenario-badge">Jalur 1</div>
    <h4 class="scenario-title">HIP-3 Staking Lockup</h4>
    <p class="scenario-desc">Persyaratan stake 500.000 HYPE per deployer venue. Dengan 10 deployer aktif saat ini, terdapat 5 juta HYPE (nilai nosional ~$332 juta pada harga $66,40) yang terkunci di smart contract. Staking mengunci likuiditas beredar, meski tidak membakar suplai secara permanen.</p>
  </div>
  <div class="paper-scenario-card">
    <div class="scenario-badge">Jalur 2</div>
    <h4 class="scenario-title">Assistance Fund Buybacks</h4>
    <p class="scenario-desc">Dokumen resmi SEC Hyperliquid Strategies mengungkapkan bahwa 99% fee protokol bersih dialokasikan ke Assistance Fund untuk melakukan pembelian pasar HYPE secara rutin dan berkelanjutan, di mana sebagian dapat dikirim ke burn wallet.</p>
  </div>
  <div class="paper-scenario-card">
    <div class="scenario-badge">Jalur 3</div>
    <h4 class="scenario-title">Collateral Velocity</h4>
    <p class="scenario-desc">Pertumbuhan saldo margin USDC dan stablecoin memperbesar kapasitas volume trading. Likuiditas yang lebih dalam menekan slippage, menarik volume institusional, dan mengakselerasi pembentukan fee protokol.</p>
  </div>
</div>
<h3 style="font-size: 16px; color: #f1f5f9; margin: 24px 0 12px; font-weight: 600;">Siklus Transmisi Nilai yang Diharapkan:</h3>
<p style="color: #94a3b8; font-size: 14px; line-height: 1.7;">Pertambahan Pasar Live &rarr; Lebih Banyak Trader &amp; Market Maker &rarr; Peningkatan Penyetoran Collateral &rarr; Lonjakan Volume Nosional &rarr; Kenaikan Net Protocol Fee &rarr; Alokasi Pembelian Pasar HYPE oleh Assistance Fund &rarr; Penyerapan Float Beredar (Net Token Absorption).</p>
<div class="paper-scenario-card" style="margin: 20px 0; border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.04);">
  <h4 style="color: #f87171; font-size: 14px; text-transform: uppercase; margin-bottom: 8px;">Batasan Evaluasi Kritis:</h4>
  <ul class="paper-bullet-list" style="margin: 0;">
    <li>Token HYPE bukan saham ekuitas dan tidak memiliki klaim yuridis atas dividen langsung perusahaan.</li>
    <li>Pembelian pasar oleh Assistance Fund bukan garansi kenaikan harga; tekanan jual dari unlock jadwal distribusi dan sentimen makro tetap mendominasi pergerakan jangka pendek.</li>
    <li>Staking mengunci token sementara, namun sewaktu-waktu dapat ditarik kembali setelah batas penutupan venue terpenuhi.</li>
    <li>Peningkatan volume dapat dipicu oleh program insentif atau churn agresif dengan fee rate efektif yang sangat rendah.</li>
  </ul>
</div>`
    },
    {
      heading: "8. PURR: Wahana Treasury HYPE di Nasdaq & Evaluasi Institusional",
      content: `<p><strong>PURR</strong> adalah saham dari <strong>Hyperliquid Strategies Inc.</strong> yang diperdagangkan secara resmi di bursa Nasdaq, berbeda dari token PURR dalam ekosistem on-chain Hyperliquid. Perusahaan mengadopsi model strategi treasury modal publik yang berfokus mengakumulasi HYPE, validasi validator, dan operasional pasar modal terdaftar.</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 35%;">Metrik Finansial Q3 2026 (30 Sep 2026)</th>
        <th style="width: 25%;">Angka Resmi Terlapor</th>
        <th style="width: 40%;">Catatan &amp; Dinamika Kuartalan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>HYPE Treasury Holdings</strong></td>
        <td>38,52 Juta HYPE</td>
        <td>Bertambah signifikan dari 29,3 juta HYPE per 30 Juni 2026.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Nilai Wajar HYPE Treasury</strong></td>
        <td>$3,5053 Miliar</td>
        <td>Dihitung berdasarkan harga pasar HYPE $90,99 pada penutupan 30 Sep.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Kas &amp; Setara Kas</strong></td>
        <td>$254,6 Juta</td>
        <td>Cadangan likuiditas kas operasional pada akhir kuartal.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Total Nilai Aset</strong></td>
        <td>$3,7643 Miliar</td>
        <td>Nilai buku aset kotor terlapor pada pembukuan emiten.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Total Utang Perusahaan</strong></td>
        <td>Nihil ($0)</td>
        <td>Neraca bersih tanpa liabilitas utang berbunga (zero debt).</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Akumulasi HYPE Selama Q3</strong></td>
        <td>9,1 Juta HYPE</td>
        <td>Total belanja modal ~$785 juta dengan harga rata-rata $86,44.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Buyback Saham PURR</strong></td>
        <td>$17 Juta</td>
        <td>Pembelian kembali sekitar 2,7 juta lembar saham di pasar terbuka.</td>
      </tr>
    </tbody>
  </table>
</div>
<p>Pada kuartal III 2026, perusahaan mencatat nilai aktiva bersih (NAV) sekitar $3,403 miliar. Melalui program At-The-Market (ATM), emiten mengantongi proceeds bersih senilai $911 juta dari penerbitan 74,6 juta saham PURR dengan rata-rata harga jual $12,20 (mNAV 1,15&times;). Penerbitan saham di atas nilai NAV menciptakan pertambahan nilai per lembar (akresi) bagi pemegang saham yang ada, sedangkan penerbitan di bawah NAV berpotensi menimbulkan dilusi kepemilikan.</p>
<p><strong>Peringatan Terhadap Data 13F:</strong> Munculnya manajer investasi global pada laporan kepemilikan 13F tidak serta merta membuktikan sentimen bullish fundamental. Posisi tersebut kerap mencerminkan strategi market-making tertutup, arbitrase mNAV, perlindungan lindung nilai (hedging), atau pasangan derivatif yang tidak terekspos dalam formulir 13F.</p>`
    },
    {
      heading: "9. Skenario 2029: Stress-Testing Potensi Skalabilitas HIP-3",
      content: `<p>Untuk memodelkan prospek jangka panjang hingga tahun 2029, kami menyusun tiga skenario stress test ilustratif. Proyeksi ini menguji sensitivitas volume harian dan tarif fee efektif terhadap pembentukan fee pool tahunan:</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 18%;">Skenario</th>
        <th style="width: 22%;">Volume Harian</th>
        <th style="width: 20%;">Fee Efektif</th>
        <th style="width: 20%;">Fee Pool / Tahun</th>
        <th style="width: 20%;">Karakteristik Lingkungan</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>Bear Case</strong></td>
        <td>$4 Miliar</td>
        <td>0,5 bps</td>
        <td>$73 Juta</td>
        <td>HIP-3 stagnan di segmen niche, churn tinggi, pembatasan ketat regulator.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Base Case</strong></td>
        <td>$12 Miliar</td>
        <td>1,0 bps</td>
        <td>$438 Juta</td>
        <td>Pertumbuhan builder stabil, likuiditas saham/komoditas mengakar kuat.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Bull Case</strong></td>
        <td>$25 Miliar</td>
        <td>1,5 bps</td>
        <td>$1,369 Miliar</td>
        <td>Venue likuiditas utama multi-aset 24/7 global dengan distribusi broker AS.</td>
      </tr>
    </tbody>
  </table>
</div>
<div class="paper-scenario-card" style="margin: 20px 0; border-left: 3px solid #8b5cf6; background: rgba(139, 92, 246, 0.04);">
  <h4 style="color: #c084fc; font-size: 14px; text-transform: uppercase; margin-bottom: 8px;">Peringatan Metodologis Valuasi Token:</h4>
  <p style="font-size: 14px; color: #e2e8f0; margin: 0; line-height: 1.6;">Investor tidak boleh mengalikan angka fee pool secara serampangan dengan rasio kelipatan valuasi perusahaan konvensional. Penilaian wajar token HYPE wajib mengevaluasi: (1) porsi fee bersih yang diserap protokol setelah bagi hasil builder, (2) volume USD riil yang dieksekusi untuk buyback, (3) laju inflasi suplai token dari jadwal unlock, serta (4) premi risiko makro kripto.</p>
</div>`
    },
    {
      heading: "10. Matriks Risiko Utama & Kondisi Pembatalan Thesis (Falsification)",
      content: `<p>Identifikasi faktor risiko fundamental dan indikator peringatan dini yang wajib diawasi secara berkala:</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 22%;">Kategori Risiko</th>
        <th style="width: 38%;">Dampak Terhadap Fundamental</th>
        <th style="width: 40%;">Indikator Peringatan Dini (Warning Signs)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="td-indicator"><strong>Integritas Oracle</strong></td>
        <td>Pasar non-kripto membutuhkan feed harga kontinu saat jam bursa tutup.</td>
        <td>Lonjakan funding rate ekstrem, deviasi mark/index lebar, sengketa settlement.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Tekanan Regulasi</strong></td>
        <td>Perpetual pre-IPO dan ekuitas dapat diklasifikasikan sebagai derivatif sekuritas terlarang.</td>
        <td>Penundaan izin FCM/CFTC pada aliansi ICE, geoblocking yurisdiksi, tindakan penegakan hukum.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Konsentrasi Builder</strong></td>
        <td>Ketergantungan berlebihan pada satu deployer (misal: Trade[XYZ]).</td>
        <td>Pangsa volume top-1 builder melebihi 70%; venue independen lain gagal tumbuh.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Kualitas Volume Rendah</strong></td>
        <td>Volume wash-trading atau insentif spekulatif tanpa retensi pengguna riil.</td>
        <td>Volume transaksi melonjak namun Open Interest (OI) dan pendapatan fee bersih mendatar.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Kebocoran Fee (Leakage)</strong></td>
        <td>Bagi hasil builder dan rabat market maker mengikis surplus protokol.</td>
        <td>Laju pertumbuhan volume nosional jauh melampaui pertumbuhan kas Assistance Fund.</td>
      </tr>
      <tr>
        <td class="td-indicator"><strong>Dinamika Suplai Token</strong></td>
        <td>Aliran pembelian buyback kalah cepat dibanding pembukaan jadwal unlock token.</td>
        <td>Net token absorption bernilai negatif; ekspansi Fully Diluted Valuation (FDV) tidak tertopang.</td>
      </tr>
    </tbody>
  </table>
</div>
<h3 style="font-size: 16px; color: #f1f5f9; margin: 24px 0 12px; font-weight: 600;">6 Kondisi yang Membatalkan / Melemahkan Thesis:</h3>
<ul class="paper-bullet-list">
  <li>Volume HIP-3 terus melonjak namun pendapatan fee bersih protokol gagal mengalami akselerasi.</li>
  <li>Mayoritas volume perdagangan lenyap seketika setelah insentif token builder dihentikan.</li>
  <li>Gagal menarik builder dan liquidity provider institusional independen di luar operator awal.</li>
  <li>Kemitraan ICE–Trade[XYZ] gagal mengantongi izin otoritas pengawas pasar AS (CFTC/SEC).</li>
  <li>Aset tokenized institusional tidak dapat digunakan lintas rantai akibat friksi kepatuhan legal transfer.</li>
  <li>Laju pembelian Assistance Fund tidak mampu mengimbangi tekanan jual dari emisi suplai beredar baru.</li>
</ul>`
    },
    {
      heading: "11. Kesimpulan Akhir & Conviction Framework",
      content: `<p>Infrastruktur HIP-3 telah sukses mentransformasikan Hyperliquid dari bursa perpetual kripto murni menjadi pusat likuiditas derivatif multi-aset. Kemitraan strategis ICE–Trade[XYZ] menyajikan pembuktian validasi teknologi paling bergengsi di industri keuangan modern.</p>
<div class="paper-table-wrap">
  <table class="paper-table">
    <thead>
      <tr>
        <th style="width: 50%;">Fakta yang Telah Terbukti Nyata (Empiris)</th>
        <th style="width: 50%;">Klaim yang Belum Terbukti (Ekspektasi)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>174 pasar HIP-3 aktif dengan volume harian masif $6,89B dan OI $4,27B.</td>
        <td>Hyperliquid dipastikan menjadi venue tunggal seluruh aset keuangan dunia.</td>
      </tr>
      <tr>
        <td>Pasar pre-IPO aktif (ANT, OAI) menyajikan price discovery likuid.</td>
        <td>Korporasi raksasa akan mencatatkan penawaran saham IPO fisik di Hyperliquid.</td>
      </tr>
      <tr>
        <td>ICE dan Trade[XYZ] menandatangani kerja sama bursa teregulasi AS.</td>
        <td>Izin operasional CFTC/SEC telah dikantongi dan peluncuran produk rampung.</td>
      </tr>
      <tr>
        <td>Staking 500.000 HYPE diwajibkan untuk setiap pembukaan venue baru.</td>
        <td>Seluruh pertambahan volume otomatis melipatgandakan nilai wajar harga HYPE.</td>
      </tr>
      <tr>
        <td>Assistance Fund secara terprogram mengakuisisi HYPE dari net fee.</td>
        <td>Token HYPE dijamin pasti naik harga semata karena sentimen narasi tokenisasi.</td>
      </tr>
    </tbody>
  </table>
</div>
<div class="paper-scenario-card" style="margin: 24px 0; border-left: 3px solid #10b981; background: rgba(16, 185, 129, 0.04);">
  <h4 style="color: #34d399; font-size: 13.5px; text-transform: uppercase; margin-bottom: 8px;">Conviction Framework Almere&Co:</h4>
  <p style="font-size: 14.5px; color: #f8fafc; margin: 0; line-height: 1.65;">Tingkatkan alokasi keyakinan (conviction) hanya jika: volume perdagangan HIP-3 mampu bertahan konsisten lintas kuartal tanpa insentif buatan, konsentrasi pangsa pasar top builder terdiversifikasi secara merata, pendapatan fee bersih protokol berbanding lurus dengan pertumbuhan volume, perizinan kliring ICE disahkan regulator, dan net token absorption HYPE terbukti positif setelah memperhitungkan emisi suplai baru.</p>
</div>
<p style="font-size: 16px; font-weight: 500; color: #ffffff; line-height: 1.6; margin-top: 24px;"><strong>Kesimpulan Satu Kalimat:</strong> Hyperliquid berpotensi menjadi lapisan perdagangan 24/7 bagi tatanan ekonomi multi-aset yang semakin terdesentralisasi on-chain; HIP-3 berperan sebagai mesin ekspansi pasar, sementara pertumbuhan pendapatan bersih protokol dan penyerapan neto suplai HYPE adalah tolok ukur utama apakah ekspansi tersebut berhasil menciptakan nilai fundamental jangka panjang bagi ekosistemnya.</p>`
    },
    {
      heading: "12. Sumber Primer, Metodologi, dan Keterbatasan Data",
      content: `<p>Laporan riset ini mengutamakan sumber primer dari spesifikasi protokol, dokumen keterbukaan emiten SEC AS, serta rilis resmi Intercontinental Exchange (ICE):</p>
<ul class="paper-bullet-list">
  <li><strong>[1] Hyperliquid Guide:</strong> HIP-3 Registry Snapshot 20 Nov 2026 (<a href="https://hyperliquidguide.com/markets/hip-3" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">hyperliquidguide.com</a>).</li>
  <li><strong>[2] Keel Research:</strong> Hyperliquid Stats Analytics, data 19 Nov 2026 (<a href="https://usekeel.io/lab/hyperliquid-stats" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">usekeel.io</a>).</li>
  <li><strong>[3] Hyperliquid Docs:</strong> HIP-3 Builder-Deployed Perpetuals Framework (<a href="https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">hyperliquid.gitbook.io</a>).</li>
  <li><strong>[4] Hyperliquid Docs:</strong> HIP-2 Hyperliquidity Liquidity Engine (<a href="https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-2-hyperliquidity" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">hyperliquid.gitbook.io</a>).</li>
  <li><strong>[5] Intercontinental Exchange (ICE):</strong> ICE and Trade[XYZ] to Bring Hyperliquid-Based Perpetual Markets Onshore, 29 Okt 2026 (<a href="https://ir.theice.com/press/news-details/2026/Intercontinental-Exchange-and-TradeXYZ-to-Bring-Hyperliquid-Based-Perpetual-Markets-Onshore/" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">ir.theice.com</a>).</li>
  <li><strong>[6] Hyperliquid Strategies Inc.:</strong> SEC Form S-1/A Registration Statement, Assistance Fund Structure (<a href="https://www.sec.gov" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">sec.gov</a>).</li>
  <li><strong>[7] Hyperliquid Strategies Inc.:</strong> SEC Form 10-Q Quarterly Report ended 30 Sep 2026 (<a href="https://www.sec.gov" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">sec.gov</a>).</li>
  <li><strong>[8] Hyperliquid Strategies Inc.:</strong> Q3 2026 Financial &amp; Treasury Operational Update (<a href="https://www.sec.gov" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">sec.gov</a>).</li>
  <li><strong>[9] Castle Labs:</strong> Pre-IPO Perps Onchain Market Research, Nov 2026 (<a href="https://castlelabs.io/research/pre-ipo-markets" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">castlelabs.io</a>).</li>
  <li><strong>[10] DeFiLlama:</strong> Hyperliquid Fees, Protocol Revenue, and Valuation Analytics, Nov 2026 (<a href="https://defillama.com" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">defillama.com</a>).</li>
  <li><strong>[11] Hyperliquid Docs:</strong> HIP-1 Native Token Standard Specifications (<a href="https://www.hyperliquiddocs.io" target="_blank" rel="noopener noreferrer" style="color:#60a5fa;">hyperliquiddocs.io</a>).</li>
</ul>
<p style="font-size: 13.5px; color: #94a3b8; line-height: 1.6; margin-top: 18px;"><strong>Batasan Metodologi Data:</strong> Data registry HIP-3 merupakan snapshot per 20 November 2026 yang dapat berubah setiap saat seiring dinamika likuiditas on-chain. Laporan keuangan SEC mencerminkan entitas hukum korporasi yang terpisah dari kode protokol on-chain. Seluruh kalkulasi fee sensitivity merupakan model teoritis dan bukan jaminan pendapatan masa depan.</p>`
    }
  ],
  methodology: "Hyperliquid Guide Registry API, Keel Research Analytics, SEC Form 10-Q/S-1A Hyperliquid Strategies Inc. (Q3 2026), Pengumuman Resmi Intercontinental Exchange (ICE), Castle Labs Research, dan DeFiLlama Protocol Analytics.",
  disclaimer: "Publikasi ini merupakan laporan riset pasar independen yang disusun oleh Tim Riset Almere&Co semata-mata untuk keperluan informasi dan edukasi objektif. Dokumen ini bukan merupakan penawaran investasi, prospektus efek, atau rekomendasi membeli maupun menjual aset digital (HYPE), saham Nasdaq (PURR), atau instrumen keuangan apa pun. Analisis dan skenario dapat berubah sewaktu-waktu tanpa pemberitahuan.",
  pdfUrl: "assets/research/hyperliquid-hip3-tokenization-value-capture.pdf"
};

// Check if already exists, replace or unshift
const existingIndex = papers.findIndex(p => p.id === hyperliquidPaper.id || p.slug === hyperliquidPaper.slug);
if (existingIndex >= 0) {
  papers[existingIndex] = hyperliquidPaper;
  console.log('✓ Memperbarui paper Hyperliquid yang sudah ada di data/research_papers.json');
} else {
  papers.unshift(hyperliquidPaper);
  console.log('✓ Menambahkan paper Hyperliquid baru di posisi teratas data/research_papers.json');
}

fs.writeFileSync(jsonPath, JSON.stringify(papers, null, 2), 'utf8');
console.log(`✓ Total papers sekarang: ${papers.length}`);
