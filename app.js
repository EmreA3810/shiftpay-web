/* ===== ShiftPay App Logic with Unified QR Protocol & Real-time Rendering ===== */
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';

(function() {
  'use strict';

  function generateShiftId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return '0x' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  function getTodayStr() {
    return new Date().toISOString().split('T')[0];
  }

  function getFormattedDateTime(d) {
    d = d || new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return {
      date: day + '.' + month + '.' + year,
      time: hours + ':' + mins,
      full: day + '.' + month + ' ' + hours + ':' + mins
    };
  }

  const candidateWorkers = [
    { name: 'Ahmet Yılmaz', addr: 'GDKF5L8P93XQ7M2W109485721094857102948571' },
    { name: 'Mehmet Kaya', addr: 'GBBC2M4V81LP09XQ293847102938471029384710' },
    { name: 'Can Demir', addr: 'GC3X8N7W92KL41OP102938471029384710293847' },
    { name: 'Ayşe Çelik', addr: 'GD78Y92KL41OP102938471029384710293847109' },
    { name: 'Fatma Öz', addr: 'GB99992KL41OP102938471029384710293847111' },
    { name: 'Ali Vural', addr: 'GC88892KL41OP102938471029384710293847122' },
    { name: 'Burak Şahin', addr: 'GD55592KL41OP102938471029384710293847133' }
  ];

  const state = {
    user: null,
    workers: [],
    shifts: [],
    merchantTx: [],
    merchantBalance: 0,
    merchantWithdrawn: 0,
    employerLocked: 10000,
    employerSpent: 0,
    employerYield: 14.8520,
    employerLockDays: 30,
    autoCompound: true,
    apy: 0.1145,
    terminalMode: 'CHECK_IN', // 'CHECK_IN' or 'CHECK_OUT'
    terminalWage: 1200,
    terminalHours: 8,
    terminalShiftId: generateShiftId(),
    terminalDate: getTodayStr(),
    posAmount: 180
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }

  function showScreen(id) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#' + id);
    if (screen) screen.classList.add('active');
  }

  function toast(msg, type) {
    type = type || 'info';
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    el.textContent = msg;
    const container = $('#toast-container');
    if (container) container.appendChild(el);
    setTimeout(() => {
      if (el && el.parentNode) el.remove();
    }, 4500);
  }

  function saveState() {
    try { localStorage.setItem('shiftpay_state', JSON.stringify(state)); } catch(e) {}
  }

  function loadState() {
    try {
      const saved = localStorage.getItem('shiftpay_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.workers)) state.workers = parsed.workers;
        if (parsed.user) state.user = parsed.user;
        if (Array.isArray(parsed.shifts)) state.shifts = parsed.shifts;
        if (Array.isArray(parsed.merchantTx)) state.merchantTx = parsed.merchantTx;
        if (typeof parsed.merchantBalance === 'number') state.merchantBalance = parsed.merchantBalance;
        if (typeof parsed.merchantWithdrawn === 'number') state.merchantWithdrawn = parsed.merchantWithdrawn;
        if (typeof parsed.employerLocked === 'number') state.employerLocked = parsed.employerLocked;
        if (typeof parsed.employerSpent === 'number') state.employerSpent = parsed.employerSpent;
        if (typeof parsed.employerYield === 'number') state.employerYield = parsed.employerYield;
        if (typeof parsed.terminalWage === 'number') state.terminalWage = parsed.terminalWage;
        if (typeof parsed.terminalHours === 'number') state.terminalHours = parsed.terminalHours;
        if (typeof parsed.posAmount === 'number') state.posAmount = parsed.posAmount;
        if (parsed.terminalMode) state.terminalMode = parsed.terminalMode;
      }
    } catch(e) {}

    const curDate = getTodayStr();
    if (state.terminalDate !== curDate) {
      state.terminalShiftId = generateShiftId();
      state.terminalDate = curDate;
    }
  }

  /* ===== QR GENERATION VIA DATAURL (CANVAS-INDEPENDENT) ===== */
  async function generateQrDataUrl(payloadObj, width) {
    try {
      return await QRCode.toDataURL(JSON.stringify(payloadObj), {
        width: width || 230,
        margin: 1,
        color: { dark: '#0a0e1a', light: '#ffffff' }
      });
    } catch (err) {
      console.error('QR Generate Error:', err);
      return '';
    }
  }

  async function drawEmployerTerminalQr() {
    const imgEl = $('#employer-qr-img');
    if (!imgEl) return;

    const wageInp = $('#inp-terminal-wage');
    if (wageInp) {
      state.terminalWage = parseFloat(wageInp.value) || 1200;
    }
    const hoursInp = $('#inp-terminal-hours');
    if (hoursInp) {
      state.terminalHours = parseInt(hoursInp.value, 10) || 8;
    }

    const wageUSDC = (state.terminalWage / 35).toFixed(2);
    const usdcEl = $('#terminal-wage-usdc');
    if (usdcEl) usdcEl.textContent = wageUSDC;

    let qrPayload;
    if (state.terminalMode === 'CHECK_OUT') {
      qrPayload = {
        protocol: 'shiftpay',
        version: '1.0',
        type: 'CHECK_OUT',
        contract: 'CDV3G7DHQEVUAMKRKK6UXVAUPLY277RRJVZNYAQX44OK4VIW5XUWFPII',
        employer_name: state.user?.name || 'ShiftPay İnşaat A.Ş.',
        employer_wallet: state.user?.wallet || 'GB52K498LX209148209384019283401928340192',
        shift_id: state.terminalShiftId,
        date: state.terminalDate,
        target_hours: state.terminalHours,
        timestamp: Date.now()
      };
    } else {
      qrPayload = {
        protocol: 'shiftpay',
        version: '1.0',
        type: 'CHECK_IN',
        contract: 'CDV3G7DHQEVUAMKRKK6UXVAUPLY277RRJVZNYAQX44OK4VIW5XUWFPII',
        employer_name: state.user?.name || 'ShiftPay İnşaat A.Ş.',
        employer_wallet: state.user?.wallet || 'GB52K498LX209148209384019283401928340192',
        shift_id: state.terminalShiftId,
        date: state.terminalDate,
        daily_wage_try: state.terminalWage,
        daily_wage_usdc: parseFloat(wageUSDC),
        target_hours: state.terminalHours,
        timestamp: Date.now()
      };
    }

    const dataUrl = await generateQrDataUrl(qrPayload, 230);
    if (dataUrl) {
      imgEl.src = dataUrl;
    }
  }

  async function drawMerchantPosQr() {
    const imgEl = $('#merchant-pos-img');
    if (!imgEl) return;

    const amountInp = $('#inp-pos-amount');
    const amount = parseFloat(amountInp?.value) || state.posAmount || 180;
    state.posAmount = amount;
    const amountUSDC = (amount / 35).toFixed(2);

    const posPayload = {
      protocol: 'shiftpay',
      version: '1.0',
      type: 'MERCHANT_PAY',
      contract: 'CDV3G7DHQEVUAMKRKK6UXVAUPLY277RRJVZNYAQX44OK4VIW5XUWFPII',
      merchant_address: state.user?.wallet || 'GAESNAF4X92LK301948572109485710294857102',
      merchant_name: state.user?.name || 'ShiftPay Esnaf / Market',
      amount_try: amount,
      amount_usdc: parseFloat(amountUSDC),
      timestamp: Date.now()
    };

    const dataUrl = await generateQrDataUrl(posPayload, 210);
    if (dataUrl) {
      imgEl.src = dataUrl;
    }
  }

  /* ===== PDF PRINT FUNCTION ===== */
  function printQrAsPdf() {
    const img = $('#employer-qr-img');
    if (!img || !img.src) {
      toast('Önce QR kodunun yüklenmesini bekleyin.', 'error');
      return;
    }

    const isCheckout = state.terminalMode === 'CHECK_OUT';
    const badgeText = isCheckout ? 'Şirket Çıkış (Check-Out) QR Kodu' : 'Şirket Giriş (Check-In) QR Kodu';
    const wage = state.terminalWage || 1200;
    const hours = state.terminalHours || 8;
    const dateStr = state.terminalDate || getTodayStr();
    const shiftIdShort = state.terminalShiftId ? state.terminalShiftId.substring(0, 16) + '...' : '0x...';

    const printWindow = window.open('', '_blank', 'width=750,height=850');
    if (!printWindow) {
      toast('Yazdırma penceresi açılamadı. Tarayıcınızın pop-up engelleyicisini kontrol edin.', 'error');
      return;
    }

    printWindow.document.write(
      '<!DOCTYPE html>' +
      '<html lang="tr">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<title>ShiftPay - ' + badgeText + '</title>' +
      '<style>' +
      'body { font-family: Segoe UI, Roboto, Helvetica, Arial, sans-serif; text-align: center; padding: 40px; color: #111; background: #fff; }' +
      '.doc-box { max-width: 500px; margin: 0 auto; border: 2px solid #111; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }' +
      '.logo { font-size: 32px; font-weight: 800; color: #00cec9; margin-bottom: 4px; letter-spacing: -0.5px; }' +
      '.sub { font-size: 13px; color: #636e72; margin-bottom: 20px; font-weight: 500; }' +
      '.badge { display: inline-block; padding: 6px 16px; background: ' + (isCheckout ? '#ffeaa7' : '#e0fbfb') + '; color: ' + (isCheckout ? '#d63031' : '#008b8b') + '; border-radius: 20px; font-weight: 700; font-size: 15px; margin-bottom: 20px; }' +
      '.qr-img { width: 280px; height: 280px; margin: 0 auto 20px auto; display: block; border: 1px solid #ddd; border-radius: 12px; padding: 10px; background: #fff; }' +
      '.details-grid { background: #f8f9fa; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px; text-align: left; font-size: 14px; line-height: 1.6; }' +
      '.details-row { display: flex; justify-content: space-between; margin-bottom: 6px; }' +
      '.details-row:last-child { margin-bottom: 0; }' +
      '.wage-highlight { font-size: 24px; font-weight: 800; color: #2d3436; text-align: center; margin-top: 10px; padding-top: 8px; border-top: 1px dashed #ccc; }' +
      '.footer-note { font-size: 12px; color: #7f8c8d; margin-top: 24px; border-top: 1px dashed #dfe6e9; padding-top: 14px; line-height: 1.4; }' +
      '</style>' +
      '</head>' +
      '<body>' +
      '<div class="doc-box">' +
      '<div class="logo">ShiftPay.</div>' +
      '<div class="sub">Günübirlik Vardiya Finansmanı &amp; Hakediş Protokolü</div>' +
      '<div class="badge">' + badgeText + '</div>' +
      '<img class="qr-img" src="' + img.src + '" alt="ShiftPay QR">' +
      '<div class="details-grid">' +
      '<div class="details-row"><span><strong>Şirket:</strong></span><span>' + (state.user?.name || 'ShiftPay İnşaat A.Ş.') + '</span></div>' +
      '<div class="details-row"><span><strong>Tarih:</strong></span><span>' + dateStr + '</span></div>' +
      '<div class="details-row"><span><strong>Shift ID:</strong></span><code>' + shiftIdShort + '</code></div>' +
      '<div class="details-row"><span><strong>Atanan Vardiya:</strong></span><span>' + hours + ' Saat</span></div>' +
      '<div class="wage-highlight">₺' + wage + ' TRY (~' + (wage/35).toFixed(2) + ' USDC)</div>' +
      '</div>' +
      '<div class="footer-note">' +
      '<strong>Talimat:</strong> İşçiler şirkete geliş veya gidişlerinde mobil ShiftPay cüzdanı ile bu QR kodu okutmalıdır.<br>' +
      '<em>Stellar Soroban Protocol 22 akıllı sözleşmesi ile güvence altına alınmıştır.</em>' +
      '</div>' +
      '</div>' +
      '<script>' +
      'window.onload = function() { setTimeout(function() { window.print(); }, 350); };' +
      '</script>' +
      '</body>' +
      '</html>'
    );
    printWindow.document.close();
  }

  /* ===== UNIFIED QR SCAN PROCESSOR (WITH HOURLY WORK ENFORCEMENT) ===== */
  function processUnifiedQrScan(rawPayload) {
    let payload = rawPayload;
    if (typeof rawPayload === 'string') {
      try {
        payload = JSON.parse(rawPayload);
      } catch (e) {
        toast('Geçersiz QR: ShiftPay formatında değil!', 'error');
        return;
      }
    }

    if (!payload || !payload.type) {
      toast('Tanınmayan QR formatı: ShiftPay protokolü bulunamadı.', 'error');
      return;
    }

    const dt = getFormattedDateTime();

    /* CASE 1: CHECK_IN (Şirket Girişi) */
    if (payload.type === 'CHECK_IN') {
      const checkedInAddrs = new Set(state.workers.map(w => w.addr));
      let nextWorker = candidateWorkers.find(cw => !checkedInAddrs.has(cw.addr));

      if (!nextWorker) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        nextWorker = {
          name: 'İşçi #' + randomNum,
          addr: 'G' + Array.from({length: 40}, () => Math.floor(Math.random()*16).toString(16).toUpperCase()).join('')
        };
      }

      const wage = payload.daily_wage_try || state.terminalWage || 1200;
      const targetHours = payload.target_hours || state.terminalHours || 8;

      state.workers.push({
        name: nextWorker.name,
        addr: nextWorker.addr,
        wage: wage,
        targetHours: targetHours,
        checkInDate: dt.date,
        checkInTime: dt.time,
        checkInTimestamp: Date.now(),
        checkOutDate: '—',
        checkOutTime: '—',
        checkOutTimestamp: null,
        duration: 'Devam Ediyor',
        status: 'active'
      });

      saveState();
      updateEmployerStats();
      renderTerminalWorkersTable();

      const shortAddr = nextWorker.addr.substring(0, 6) + '...' + nextWorker.addr.substring(nextWorker.addr.length - 4);
      
      showScanResultModal(
        'CHECK_IN',
        '✅ Şirket Check-In Algılandı!\n' +
        'İşçi: ' + nextWorker.name + '\n' +
        'Cüzdan: ' + shortAddr + ' (Otomatik Çekildi)\n' +
        'Giriş Zamanı: ' + dt.full + '\n' +
        'Atanan Vardiya: ' + targetHours + ' Saat\n' +
        'Günlük Hakediş: ' + wage + ' TRY (~' + (wage/35).toFixed(2) + ' USDC)\n' +
        'Durum: Aktif Çalışıyor'
      );

      toast('Şirket Girişi: ' + nextWorker.name + ' (' + shortAddr + ') işe başladı. Atanan süre: ' + targetHours + ' Saat.', 'success');
    }

    /* CASE 2: CHECK_OUT (Şirket Çıkışı - SÜRE LİMİTİ KONTROLLÜ) */
    else if (payload.type === 'CHECK_OUT') {
      let activeWorker = null;
      if (payload.worker_addr) {
        activeWorker = state.workers.find(w => w.addr === payload.worker_addr && w.status === 'active');
      }
      if (!activeWorker) {
        activeWorker = state.workers.find(w => w.status === 'active');
      }

      if (!activeWorker) {
        toast('Şirkette çıkış yapacak aktif çalışan işçi bulunamadı!', 'error');
        return;
      }

      // KONTROL: ATANAN SAAT DOLDURULDU MU?
      const checkInTimeMs = activeWorker.checkInTimestamp || Date.now();
      const workedMs = Date.now() - checkInTimeMs;
      const workedHours = workedMs / (1000 * 60 * 60);
      const targetHours = activeWorker.targetHours || state.terminalHours || 8;

      if (workedHours < targetHours) {
        // HATA VER VE ÇIKIŞ YAPILMASINA İZİN VERME!
        const remainingMs = (targetHours * 3600000) - workedMs;
        const remHours = Math.floor(remainingMs / 3600000);
        const remMins = Math.ceil((remainingMs % 3600000) / 60000);
        const remStr = remHours > 0 ? (remHours + ' saat ' + remMins + ' dk') : (remMins + ' dakika');

        const workedMins = Math.max(1, Math.floor(workedMs / 60000));
        const workedStr = workedMins < 60 ? (workedMins + ' dk') : (Math.floor(workedMins/60) + 's ' + (workedMins%60) + 'dk');

        toast('❌ Erken Çıkış Reddedildi! ' + activeWorker.name + ' için atanan süre: ' + targetHours + ' Saat. Çalışılan süre: ' + workedStr + '. Kalan süre: ' + remStr + '. Limit dolmadan çıkış yapılamaz!', 'error');

        showScanResultModal(
          'ERROR',
          '❌ ERKEN ÇIKIŞ REDDEDİLDİ!\n' +
          'İşçi: ' + activeWorker.name + '\n' +
          'Atanan Vardiya: ' + targetHours + ' Saat\n' +
          'Şu Ana Kadar Çalışılan: ' + workedStr + '\n' +
          'Kalan Süre: ' + remStr + '\n\n' +
          '⚠️ İşçi belirlenen mesai saatini doldurmadan çıkış yapamaz ve hakediş kesinleştirilemez!'
        );
        return; // ÇIKIŞI İPTAL ET, İŞÇİ AKTİF KALIR!
      }

      // SÜRE LİMİTİ KARŞILANDI - ÇIKIŞI TAMAMLA & HAKEDİŞİ OTOMATİK DAĞIT!
      activeWorker.checkOutDate = dt.date;
      activeWorker.checkOutTime = dt.time;
      activeWorker.checkOutTimestamp = Date.now();
      activeWorker.status = 'completed';

      const workedMins = Math.round(workedMs / 60000);
      const hrs = Math.floor(workedMins / 60);
      const remMins = workedMins % 60;
      activeWorker.duration = hrs + 's ' + remMins + 'dk';

      // SADECE MUHASEBE KAYDI (ACCOUNTING) - balances[worker] += wages[worker]
      // ÖNEMLİ: Kontratın gerçek token bakiyesinden (pool_balance / locked_budget) HİÇBİR ŞEY düşmez!
      // Varlıklar DeFindex getirisinde kalmaya devam eder.
      activeWorker.claimBalance = (activeWorker.claimBalance || 0) + activeWorker.wage;
      state.workerAvailableLimit = (state.workerAvailableLimit || 0) + activeWorker.wage;

      // Vardiya geçmişine ekle (Kasa düşülmez, sadece limit tanımlanır)
      state.shifts.unshift({
        worker: activeWorker.name,
        date: dt.date,
        duration: activeWorker.duration + ' (Tamamlandı)',
        wage: activeWorker.wage,
        status: 'Limit Tanımlandı (' + activeWorker.claimBalance + ' TRY)',
        remainingLocked: state.employerLocked
      });

      saveState();
      updateEmployerStats();
      renderTerminalWorkersTable();
      renderShiftsTable();

      const shortAddr = activeWorker.addr.substring(0, 6) + '...' + activeWorker.addr.substring(activeWorker.addr.length - 4);

      showScanResultModal(
        'CHECK_OUT',
        '🏁 Şirket Çıkışı Onaylandı!\n' +
        'İşçi: ' + activeWorker.name + ' (' + shortAddr + ')\n' +
        'Atanan Süre: ' + targetHours + ' Saat (Hedef Tamamlandı)\n' +
        'Giriş: ' + activeWorker.checkInTime + ' | Çıkış: ' + activeWorker.checkOutTime + '\n' +
        'Toplam Mesai: ' + activeWorker.duration + '\n' +
        'Hak Edilen Günlük Ücret: +' + activeWorker.wage + ' TRY\n' +
        'Toplam Kullanılabilir Bakiye (Limit): ' + activeWorker.claimBalance + ' TRY\n\n' +
        'ℹ️ Muhasebe kaydı güncellendi. Gerçek para kasadan çekilmedi (DeFindex getirisinde kalmaya devam ediyor).\nİşçi bu limiti anlaşmalı esnafta anında harcayabilir. Nakit çekim ise 30 gün vade dolunca işçinin kendi mobil uygulamasından yapılacaktır.'
      );

      toast('✅ Mesai Tamamlandı! ' + activeWorker.name + ' için +' + activeWorker.wage + ' TRY harcama limiti tanımlandı (Kullanılabilir Bakiye: ' + activeWorker.claimBalance + ' TRY). Kasadan para düşülmedi.', 'success');
    }

    /* CASE 3: MERCHANT_PAY (spend_at_merchant - Gerçek Transfer) */
    else if (payload.type === 'MERCHANT_PAY') {
      const amount = payload.amount_try || state.posAmount || 180;

      // Bakiyesi olan işçiyi bul (varsa çıkış yapmış ve limiti olan işçilerden)
      let payingWorker = state.workers.find(w => (w.claimBalance || 0) >= amount);
      if (!payingWorker && state.workers.length > 0) {
        payingWorker = state.workers.find(w => (w.claimBalance || 0) > 0) || state.workers[state.workers.length - 1];
      }

      const currentBalance = payingWorker ? (payingWorker.claimBalance || 0) : 0;
      const workerName = payingWorker ? payingWorker.name : 'İşçi';

      // KONTROL: require(tutar <= balances[işçi_adresi])
      if (currentBalance < amount) {
        showScanResultModal(
          'ERROR',
          '❌ ESNAF HARCAMASI REDDEDİLDİ!\n' +
          'İşçi: ' + workerName + '\n' +
          'Kullanılabilir Bakiye (Limit): ' + currentBalance.toFixed(2) + ' TRY\n' +
          'İstenen Harcama: ' + amount.toFixed(2) + ' TRY\n\n' +
          '⚠️ Yetersiz Bakiye! İşçi bakiyesinden fazlasını harcayamaz veya çekemez.'
        );
        toast('❌ Yetersiz Bakiye! ' + workerName + ' limiti: ' + currentBalance.toFixed(2) + ' TRY, İstenen: ' + amount.toFixed(2) + ' TRY. İşlem reddedildi!', 'error');
        return;
      }

      // 1. İşçinin kullanılabilir bakiyesinden düş
      payingWorker.claimBalance -= amount;

      // 2. ŞİMDİ GERÇEK VARLIK TRANSFERİ GERÇEKLEŞİR: Kontrat havuzundan düş ve esnafa aktar
      const amountUSDC = amount / 35;
      state.employerLocked = Math.max(0, state.employerLocked - amountUSDC);
      state.employerSpent += amountUSDC;

      // 3. Esnaf bakiyesini artır
      state.merchantBalance += amount;
      state.merchantTx.unshift({
        id: 'tx-' + Date.now(),
        worker: workerName,
        amount: amount,
        date: new Date().toISOString(),
        status: 'Başarılı (spend_at_merchant)'
      });

      saveState();
      updateMerchantStats();
      updateEmployerStats();
      renderTerminalWorkersTable();
      renderMerchantTx();

      showScanResultModal(
        'MERCHANT_PAY',
        '✅ Esnaf POS Harcaması Tamamlandı (spend_at_merchant)!\n' +
        'Tahsil Edilen: ' + amount.toFixed(2) + ' TRY (~' + amountUSDC.toFixed(2) + ' USDC)\n' +
        'Ödeyen İşçi: ' + workerName + '\n' +
        'İşçinin Kalan Bakiyesi: ' + payingWorker.claimBalance.toFixed(2) + ' TRY\n' +
        'Gerçek Transfer: Kasadan düşüldü ve esnaf cüzdanına aktarıldı.'
      );

      toast('✅ Ödeme Alındı! ' + workerName + ' bakiyesinden ' + amount.toFixed(2) + ' TRY düşüldü. Kalan limit: ' + payingWorker.claimBalance.toFixed(2) + ' TRY', 'success');
    }

    else {
      toast('Tanınmayan ShiftPay QR türü: ' + payload.type, 'error');
    }
  }

  function showScanResultModal(type, msg) {
    const card = $('#scan-result-card');
    const badge = $('#scan-result-badge');
    const msgEl = $('#scan-result-msg');
    if (!card || !badge || !msgEl) return;

    card.style.display = 'block';
    if (type === 'CHECK_IN') {
      badge.textContent = '🎯 ŞİRKET GİRİŞ QR (CHECK_IN)';
      badge.className = 'badge badge-active mb-1';
      card.style.borderColor = 'var(--accent)';
      card.style.background = 'rgba(0, 206, 201, 0.12)';
    } else if (type === 'CHECK_OUT') {
      badge.textContent = '🏁 ŞİRKET ÇIKIŞ QR (CHECK_OUT)';
      badge.className = 'badge mb-1';
      badge.style.background = 'rgba(46, 213, 115, 0.2)';
      badge.style.color = '#2ed573';
      card.style.borderColor = '#2ed573';
      card.style.background = 'rgba(46, 213, 115, 0.12)';
    } else if (type === 'ERROR') {
      badge.textContent = '⚠️ ERKEN ÇIKIŞ REDDEDİLDİ';
      badge.className = 'badge mb-1';
      badge.style.background = 'rgba(235, 77, 75, 0.25)';
      badge.style.color = '#eb4d4b';
      card.style.borderColor = '#eb4d4b';
      card.style.background = 'rgba(235, 77, 75, 0.12)';
    } else if (type === 'WITHDRAW') {
      badge.textContent = '🏦 ANCHOR SEP-24 NAKİT ÇEKİM (WITHDRAW)';
      badge.className = 'badge mb-1';
      badge.style.background = 'rgba(9, 132, 227, 0.2)';
      badge.style.color = '#0984e3';
      card.style.borderColor = '#0984e3';
      card.style.background = 'rgba(9, 132, 227, 0.12)';
    } else {
      badge.textContent = '🎯 ESNAF POS ÖDEME QR (MERCHANT_PAY)';
      badge.className = 'badge mb-1';
      badge.style.background = 'rgba(253, 121, 168, 0.2)';
      badge.style.color = '#fd79a8';
      card.style.borderColor = '#fd79a8';
      card.style.background = 'rgba(253, 121, 168, 0.12)';
    }
    msgEl.textContent = msg;
  }

  /* ===== UNIVERSAL QR SCANNER MODAL CONTROLLER ===== */
  let html5Scanner = null;

  function openScannerModal() {
    const modal = $('#qr-scanner-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeScannerModal() {
    const modal = $('#qr-scanner-modal');
    if (modal) modal.style.display = 'none';
    stopCamera();
    const resultCard = $('#scan-result-card');
    if (resultCard) resultCard.style.display = 'none';
  }

  async function startCamera() {
    const statusText = $('#camera-status-text');
    try {
      if (statusText) statusText.textContent = 'Kamera başlatılıyor...';
      if (!html5Scanner) {
        html5Scanner = new Html5Qrcode('qr-reader-video');
      }

      const qrCodeSuccessCallback = (decodedText, decodedResult) => {
        stopCamera();
        processUnifiedQrScan(decodedText);
      };

      const config = { fps: 10, qrbox: { width: 220, height: 220 } };
      await html5Scanner.start(
        { facingMode: 'environment' },
        config,
        qrCodeSuccessCallback
      );

      if (statusText) statusText.style.display = 'none';
    } catch (err) {
      console.warn('Camera start error:', err);
      if (statusText) {
        statusText.style.display = 'block';
        statusText.textContent = 'Kamera açılamadı (İzin verilmedi veya cihazda kamera yok). Hızlı Test sekmesini kullanabilirsiniz.';
      }
    }
  }

  async function stopCamera() {
    if (html5Scanner && html5Scanner.isScanning) {
      try {
        await html5Scanner.stop();
      } catch (e) {}
    }
    const statusText = $('#camera-status-text');
    if (statusText) {
      statusText.style.display = 'block';
      statusText.textContent = 'Kamera durduruldu.';
    }
  }

  /* ===== EMPLOYER DASHBOARD CONTROLLER ===== */
  function enterEmployerDashboard() {
    showScreen('screen-employer');
    const nameEl = $('#employer-topbar-name');
    if (nameEl && state.user) nameEl.textContent = state.user.name;
    updateEmployerStats();
    renderTerminalWorkersTable();
    renderShiftsTable();
    runCompoundSimulator();
    startLiveYieldStream();
    drawEmployerTerminalQr();

    const termBtn = $('#screen-employer').querySelector('[data-panel="emp-terminal"]');
    if (termBtn) termBtn.click();
  }

  function updateEmployerStats() {
    const activeCount = state.workers.filter(w => w.status === 'active').length;
    const completedCount = state.workers.filter(w => w.status === 'completed').length;
    const totalPayroll = state.workers.reduce((s, w) => s + (w.wage || state.terminalWage), 0);

    const lockedEl = $('#emp-stat-locked');
    if (lockedEl) lockedEl.textContent = state.employerLocked.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC';

    const yieldEl = $('#emp-stat-yield');
    if (yieldEl) yieldEl.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';

    const spentEl = $('#emp-stat-spent');
    if (spentEl) spentEl.textContent = state.employerSpent.toFixed(2) + ' USDC';

    const workersEl = $('#emp-stat-workers');
    if (workersEl) workersEl.textContent = activeCount;

    const countBadge = $('#active-worker-count-badge');
    if (countBadge) countBadge.textContent = activeCount + ' Çalışıyor';

    const compBadge = $('#completed-worker-count-badge');
    if (compBadge) compBadge.textContent = completedCount + ' Çıkış Yaptı';

    // Mgmt panel stats
    const mgmtTotal = $('#mgmt-stat-total');
    if (mgmtTotal) mgmtTotal.textContent = state.workers.length;
    const mgmtActive = $('#mgmt-stat-active');
    if (mgmtActive) mgmtActive.textContent = activeCount;
    const mgmtComp = $('#mgmt-stat-completed');
    if (mgmtComp) mgmtComp.textContent = completedCount;
    const mgmtPay = $('#mgmt-stat-payroll');
    if (mgmtPay) mgmtPay.textContent = totalPayroll.toLocaleString('tr-TR') + ' TRY';

    const princEl = $('#defindex-principal');
    if (princEl) princEl.textContent = state.employerLocked.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC';

    const earnedEl = $('#defindex-earned');
    if (earnedEl) earnedEl.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';
  }

  let streamInterval = null;
  function startLiveYieldStream() {
    if (streamInterval) clearInterval(streamInterval);

    streamInterval = setInterval(() => {
      if (state.autoCompound && state.employerLocked > 0) {
        const apyPerSec = state.apy / (365 * 86400);
        const secondYield = state.employerLocked * apyPerSec;
        const tickYield = secondYield * 0.25;

        state.employerYield += tickYield;
        state.employerLocked += tickYield;

        const counterEl = $('#live-stream-counter');
        if (counterEl) {
          counterEl.textContent = '+' + state.employerYield.toFixed(6) + ' USDC';
        }

        const statYield = $('#emp-stat-yield');
        if (statYield) statYield.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';

        const earnedEl = $('#defindex-earned');
        if (earnedEl) earnedEl.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';
      }
    }, 250);
  }

  function renderTerminalWorkersTable() {
    const tbody = $('#terminal-workers-tbody');
    const mgmtTbody = $('#mgmt-workers-tbody');

    if (state.workers.length === 0) {
      const emptyHtml = '<tr class="empty-row"><td colspan="9">Henüz QR okutan işçi yok. Yukarıdaki Giriş QR kodunu okutarak işçi girişi yapın.</td></tr>';
      if (tbody) tbody.innerHTML = emptyHtml;
      if (mgmtTbody) mgmtTbody.innerHTML = emptyHtml;
      return;
    }

    const rowsHtml = state.workers.map(w => {
      const shortAddr = w.addr.substring(0, 8) + '...' + w.addr.substring(w.addr.length - 6);
      const isActive = w.status === 'active';
      const targetHours = w.targetHours || state.terminalHours || 8;

      let workedDisplay = '';
      if (isActive) {
        const workedMs = Date.now() - (w.checkInTimestamp || Date.now());
        const mins = Math.max(1, Math.floor(workedMs / 60000));
        workedDisplay = mins < 60 ? (mins + ' dk') : (Math.floor(mins/60) + 's ' + (mins%60) + 'dk');
      } else {
        workedDisplay = w.duration;
      }

      const statusBadge = isActive
        ? '<span class="badge badge-active">● Çalışıyor</span>'
        : '<span class="badge" style="background: rgba(46, 213, 115, 0.2); color: #2ed573; border: 1px solid rgba(46, 213, 115, 0.4);">🏁 Çıkış Yapıldı</span>';

      const actionBtn = isActive
        ? '<div style="display: flex; gap: 4px; flex-wrap: wrap;">' +
            '<button class="btn-xs btn-outline btn-worker-checkout" data-addr="' + w.addr + '" title="Vardiyayı bitir ve çıkış yaptır">🏁 Çıkış Yap</button>' +
            '<button class="btn-xs btn-outline btn-worker-fastforward" data-addr="' + w.addr + '" title="Test için süreyi atanan saat kadar doldurur" style="color: #f1c40f; border-color: rgba(241, 196, 15, 0.4);">⚡ Süreyi Doldur (Test)</button>' +
          '</div>'
        : '<div style="display: flex; flex-direction: column; gap: 2px;">' +
            '<span class="mono text-cyan font-bold" style="font-size: 0.85rem;" title="Kontrat içindeki kullanılabilir harcama limiti">💳 ' + (w.claimBalance !== undefined ? w.claimBalance : w.wage) + ' TRY Limit</span>' +
            '<span class="text-muted" style="font-size: 0.72rem;">(Esnafta Anında / Mobilde 30G Çekim)</span>' +
          '</div>';

      const checkOutDisplay = isActive ? '<span class="text-muted" style="font-size: 0.8rem;">⏳ Mesaide</span>' : (w.checkOutDate ? w.checkOutDate.substring(0, 5) + ' ' + w.checkOutTime : w.checkOutTime);
      const checkInDisplay = (w.checkInDate ? w.checkInDate.substring(0, 5) + ' ' : '') + w.checkInTime;

      return '<tr>' +
        '<td><strong>' + w.name + '</strong></td>' +
        '<td class="mono text-cyan">' + shortAddr + '</td>' +
        '<td>' + checkInDisplay + '</td>' +
        '<td>' + checkOutDisplay + '</td>' +
        '<td>' +
          '<div style="display: inline-flex; align-items: center; gap: 4px;">' +
            '<input type="number" class="wage-input-inline hours-input-inline" data-addr="' + w.addr + '" value="' + targetHours + '" min="1" max="24" style="width: 55px; text-align: center;">' +
            '<span style="font-size: 0.72rem; color: var(--text-muted);">Saat</span>' +
          '</div>' +
        '</td>' +
        '<td>' + workedDisplay + '</td>' +
        '<td>' +
          '<div style="display: inline-flex; align-items: center; gap: 4px;">' +
            '<span style="font-weight: 700; color: var(--accent); font-size: 0.9rem;">₺</span>' +
            '<input type="number" class="wage-input-inline" data-addr="' + w.addr + '" value="' + w.wage + '" min="100" step="50">' +
            '<span style="font-size: 0.72rem; color: var(--text-muted);">TRY</span>' +
          '</div>' +
        '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + actionBtn + '</td>' +
        '</tr>';
    }).join('');

    if (tbody) tbody.innerHTML = rowsHtml;
    if (mgmtTbody) mgmtTbody.innerHTML = rowsHtml;
  }

  function renderShiftsTable() {
    const tbody = $('#shifts-tbody');
    if (!tbody) return;
    if (state.shifts.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Henüz vardiya kaydı yok. İşçiler mesaisini tamamladıkça kayıtlar buraya eklenir.</td></tr>';
      return;
    }

    tbody.innerHTML = state.shifts.map(s => {
      return '<tr>' +
        '<td>' + s.worker + '</td>' +
        '<td>' + s.date + '</td>' +
        '<td>' + s.duration + '</td>' +
        '<td class="text-green font-bold">' + s.wage + ' TRY</td>' +
        '<td class="mono">' + s.remainingLocked.toFixed(2) + ' USDC</td>' +
        '<td><span class="badge badge-active">● Dağıtıldı (Soroban)</span></td>' +
        '</tr>';
    }).join('');
  }

  function runCompoundSimulator() {
    const principal = state.employerLocked || 10000;
    const apy = state.apy || 0.1145;
    const days = state.employerLockDays || 30;
    const dailyWageTRY = state.terminalWage || 1200;
    const workerCount = state.workers.length || 3;
    const dailyWageUSDC = (dailyWageTRY * workerCount) / 35;

    const simTotalLocked = $('#sim-total-locked');
    if (simTotalLocked) simTotalLocked.textContent = principal.toLocaleString('tr-TR') + ' USDC';

    const simDailyPayout = $('#sim-daily-payout');
    if (simDailyPayout) simDailyPayout.textContent = dailyWageUSDC.toFixed(2) + ' USDC/gün';

    let remaining = principal;
    let totalYield = 0;
    const dailyRate = apy / 365;
    const rows = [];

    for (let day = 1; day <= days; day++) {
      const dayYield = remaining * dailyRate;
      totalYield += dayYield;
      remaining = remaining + dayYield - dailyWageUSDC;
      if (remaining < 0) remaining = 0;

      if (day === 1 || day % 5 === 0 || day === days) {
        rows.push({
          period: 'Gün ' + day,
          remaining: remaining.toFixed(2),
          dayYield: dayYield.toFixed(4),
          totalYield: totalYield.toFixed(4)
        });
      }
    }

    const simTotalYield = $('#sim-total-yield');
    if (simTotalYield) simTotalYield.textContent = '+' + totalYield.toFixed(2) + ' USDC';

    const savingsRate = ((totalYield / (dailyWageUSDC * days)) * 100).toFixed(2);
    const simSavingsRate = $('#sim-savings-rate');
    if (simSavingsRate) simSavingsRate.textContent = '%' + savingsRate + ' Bordro Tasarrufu';

    const tbody = $('#sim-tbody');
    if (tbody) {
      tbody.innerHTML = rows.map(r => {
        return '<tr>' +
          '<td><strong>' + r.period + '</strong></td>' +
          '<td class="mono font-bold text-cyan">' + r.remaining + ' USDC</td>' +
          '<td class="text-green mono">+' + r.dayYield + ' USDC</td>' +
          '<td class="text-green font-bold mono">+' + r.totalYield + ' USDC</td>' +
          '</tr>';
      }).join('');
    }
  }

  /* ===== MERCHANT DASHBOARD CONTROLLER ===== */
  function enterMerchantDashboard() {
    showScreen('screen-merchant');
    const nameEl = $('#merchant-topbar-name');
    if (nameEl && state.user) nameEl.textContent = state.user.name;
    updateMerchantStats();
    renderMerchantTx();
    drawMerchantPosQr();

    const posBtn = $('#screen-merchant').querySelector('[data-panel="mrc-pos"]');
    if (posBtn) posBtn.click();
  }

  function updateMerchantStats() {
    const todayTotal = state.merchantTx
      .filter(tx => isToday(tx.date))
      .reduce((sum, tx) => sum + tx.amount, 0);

    const mrcToday = $('#mrc-stat-today');
    if (mrcToday) mrcToday.textContent = todayTotal.toFixed(2) + ' TRY';

    const mrcTotal = $('#mrc-stat-total');
    if (mrcTotal) mrcTotal.textContent = state.merchantBalance.toFixed(2) + ' TRY';

    const mrcCount = $('#mrc-stat-txcount');
    if (mrcCount) mrcCount.textContent = state.merchantTx.filter(tx => isToday(tx.date)).length;

    const mrcWithdrawn = $('#mrc-stat-withdrawn');
    if (mrcWithdrawn) mrcWithdrawn.textContent = state.merchantWithdrawn.toFixed(2) + ' TRY';
  }

  function isToday(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }

  function renderMerchantTx() {
    const tbody = $('#mrc-tx-tbody');
    const allTbody = $('#mrc-all-tx-tbody');
    if (!tbody) return;

    if (state.merchantTx.length === 0) {
      const emptyHtml = '<tr class="empty-row"><td colspan="4">Henüz işlem yok. Yukarıdaki QR kodunu okutarak ödeme alın.</td></tr>';
      tbody.innerHTML = emptyHtml;
      if (allTbody) allTbody.innerHTML = emptyHtml;
      return;
    }

    const rowsHtml = state.merchantTx.slice(0, 10).map(tx => {
      const d = new Date(tx.date);
      const timeStr = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      return '<tr>' +
        '<td>' + timeStr + '</td>' +
        '<td><strong>' + tx.worker + '</strong></td>' +
        '<td class="text-green font-bold">+' + tx.amount.toFixed(2) + ' TRY</td>' +
        '<td><span class="badge badge-active">● Tahsil Edildi</span></td>' +
        '</tr>';
    }).join('');

    tbody.innerHTML = rowsHtml;
    if (allTbody) allTbody.innerHTML = rowsHtml;
  }

  /* ===== EVENT LISTENERS & SETUP (SINGLE INITIALIZATION GUARD) ===== */
  let isAppInitialized = false;

  function initRouting() {
    if (isAppInitialized) return;
    isAppInitialized = true;

    loadState();

    window.onPrivyLoginSuccess = function(user) {
      state.user = user;
      saveState();
      const roleName = $('#role-user-name');
      if (roleName) roleName.textContent = user.name || user.email;
      showScreen('screen-role');
    };

    const roleEmployer = $('#role-employer');
    if (roleEmployer) {
      roleEmployer.addEventListener('click', function() {
        if (!state.user) state.user = { name: 'İşveren Yönetici', email: 'employer@shiftpay.io', wallet: 'GB52K498LX209148209384019283401928340192' };
        enterEmployerDashboard();
      });
    }

    const roleMerchant = $('#role-merchant');
    if (roleMerchant) {
      roleMerchant.addEventListener('click', function() {
        if (!state.user) state.user = { name: 'Esnaf / Market', email: 'merchant@shiftpay.io', wallet: 'GAESNAF4X92LK301948572109485710294857102' };
        enterMerchantDashboard();
      });
    }

    /* Terminal Mode Toggle (Check-In vs Check-Out) */
    const btnModeCheckin = $('#btn-mode-checkin');
    const btnModeCheckout = $('#btn-mode-checkout');
    const terminalWageCard = $('#terminal-wage-card');
    const terminalQrBadge = $('#terminal-qr-badge');
    const terminalQrHint = $('#terminal-qr-hint');
    const btnSimulateText = $('#btn-simulate-text');

    function setTerminalMode(mode) {
      state.terminalMode = mode;
      saveState();

      if (mode === 'CHECK_OUT') {
        if (btnModeCheckout) btnModeCheckout.classList.add('active', 'checkout-mode');
        if (btnModeCheckin) btnModeCheckin.classList.remove('active');
        if (terminalWageCard) terminalWageCard.style.display = 'none';
        if (terminalQrBadge) {
          terminalQrBadge.textContent = "🏁 Canlı Şirket Check-Out QR'ı";
          terminalQrBadge.style.background = 'rgba(255, 165, 2, 0.2)';
          terminalQrBadge.style.color = '#ffa502';
          terminalQrBadge.style.borderColor = '#ffa502';
        }
        if (terminalQrHint) {
          terminalQrHint.innerHTML = "İşçiler mesai bitiminde bu QR'ı mobil uygulamalarından okutur. Atanan süre (saat) dolmuşsa çıkış kaydedilir ve hakediş dağıtılır.";
        }
        if (btnSimulateText) {
          btnSimulateText.textContent = '📱 Mobil Çıkış Taramasını Simüle Et (Check-Out)';
        }
      } else {
        if (btnModeCheckin) btnModeCheckin.classList.add('active');
        if (btnModeCheckout) btnModeCheckout.classList.remove('active', 'checkout-mode');
        if (terminalWageCard) terminalWageCard.style.display = 'block';
        if (terminalQrBadge) {
          terminalQrBadge.textContent = "● Canlı Şirket Check-In QR'ı";
          terminalQrBadge.style.background = 'rgba(0, 206, 201, 0.2)';
          terminalQrBadge.style.color = 'var(--accent)';
          terminalQrBadge.style.borderColor = 'var(--accent)';
        }
        if (terminalQrHint) {
          terminalQrHint.innerHTML = 'İşçiler şirkete geldiğinde bu QR\'ı mobil uygulamalarından okutur. Kişi adı ve Stellar cüzdan adresi (<code class=\'mono\'>G...</code>) anında otomatik olarak sisteme çekilir.';
        }
        if (btnSimulateText) {
          btnSimulateText.textContent = '📱 Mobil Giriş Taramasını Simüle Et (Check-In)';
        }
      }

      drawEmployerTerminalQr();
    }

    if (btnModeCheckin) {
      btnModeCheckin.addEventListener('click', function() { setTerminalMode('CHECK_IN'); });
    }
    if (btnModeCheckout) {
      btnModeCheckout.addEventListener('click', function() { setTerminalMode('CHECK_OUT'); });
    }

    /* Terminal Wage & Hours Input Realtime Update */
    const wageInp = $('#inp-terminal-wage');
    if (wageInp) {
      wageInp.addEventListener('input', function() {
        state.terminalWage = parseFloat(this.value) || 1200;
        state.terminalShiftId = generateShiftId();
        saveState();
        drawEmployerTerminalQr();
      });
      wageInp.addEventListener('change', function() {
        toast('Ücret ' + state.terminalWage + ' TRY olarak güncellendi. Yeni Check-In QR üretildi!', 'info');
      });
    }

    const hoursInp = $('#inp-terminal-hours');
    if (hoursInp) {
      hoursInp.addEventListener('input', function() {
        state.terminalHours = parseInt(this.value, 10) || 8;
        state.terminalShiftId = generateShiftId();
        saveState();
        drawEmployerTerminalQr();
      });
      hoursInp.addEventListener('change', function() {
        toast('Atanan vardiya ' + state.terminalHours + ' Saat olarak güncellendi!', 'info');
      });
    }

    /* PDF Print Trigger */
    const btnPrintQr = $('#btn-print-qr-pdf');
    if (btnPrintQr) {
      btnPrintQr.addEventListener('click', printQrAsPdf);
    }

    /* Refresh Terminal QR */
    const btnRefreshTerminal = $('#btn-refresh-terminal-qr');
    if (btnRefreshTerminal) {
      btnRefreshTerminal.addEventListener('click', function() {
        state.terminalShiftId = generateShiftId();
        state.terminalDate = getTodayStr();
        saveState();
        drawEmployerTerminalQr();
        toast('Günün Check-In/Out QR kodu ve Shift ID yenilendi!', 'success');
      });
    }

    /* Simulate Worker Check-In or Check-Out based on active mode */
    const btnSimWorkerScan = $('#btn-simulate-worker-scan');
    if (btnSimWorkerScan) {
      btnSimWorkerScan.addEventListener('click', function() {
        if (state.terminalMode === 'CHECK_OUT') {
          processUnifiedQrScan({
            protocol: 'shiftpay',
            type: 'CHECK_OUT',
            shift_id: state.terminalShiftId,
            date: state.terminalDate
          });
        } else {
          processUnifiedQrScan({
            protocol: 'shiftpay',
            type: 'CHECK_IN',
            daily_wage_try: state.terminalWage,
            target_hours: state.terminalHours,
            shift_id: state.terminalShiftId,
            date: state.terminalDate
          });
        }
      });
    }

    /* Inline Wage & Hours Edit, Row Check-Out, and Fast-Forward via Delegation */
    function attachWorkerTableEvents(tbodySelector) {
      const tb = $(tbodySelector);
      if (!tb) return;

      tb.addEventListener('input', function(e) {
        // Wage inline edit
        if (e.target && e.target.classList.contains('wage-input-inline') && !e.target.classList.contains('hours-input-inline')) {
          const addr = e.target.getAttribute('data-addr');
          const newWage = parseFloat(e.target.value) || 0;
          const worker = state.workers.find(w => w.addr === addr);
          if (worker) {
            worker.wage = newWage;
            saveState();
            updateEmployerStats();
            runCompoundSimulator();
          }
        }
        // Hours inline edit
        if (e.target && e.target.classList.contains('hours-input-inline')) {
          const addr = e.target.getAttribute('data-addr');
          const newHours = parseInt(e.target.value, 10) || 8;
          const worker = state.workers.find(w => w.addr === addr);
          if (worker) {
            worker.targetHours = newHours;
            saveState();
            updateEmployerStats();
          }
        }
      });

      tb.addEventListener('change', function(e) {
        if (e.target && e.target.classList.contains('wage-input-inline') && !e.target.classList.contains('hours-input-inline')) {
          const addr = e.target.getAttribute('data-addr');
          const worker = state.workers.find(w => w.addr === addr);
          if (worker) toast(worker.name + ' hakedişi ' + worker.wage + ' TRY olarak güncellendi.', 'info');
        }
        if (e.target && e.target.classList.contains('hours-input-inline')) {
          const addr = e.target.getAttribute('data-addr');
          const worker = state.workers.find(w => w.addr === addr);
          if (worker) toast(worker.name + ' için atanan mesai ' + worker.targetHours + ' Saat olarak güncellendi.', 'info');
        }
      });

      tb.addEventListener('click', function(e) {
        // Worker Checkout click
        const btnCheckout = e.target.closest('.btn-worker-checkout');
        if (btnCheckout) {
          const addr = btnCheckout.getAttribute('data-addr');
          processUnifiedQrScan({
            protocol: 'shiftpay',
            type: 'CHECK_OUT',
            worker_addr: addr
          });
          return;
        }

        // Fast-Forward (Süreyi Doldur Test) click
        const btnFastForward = e.target.closest('.btn-worker-fastforward');
        if (btnFastForward) {
          const addr = btnFastForward.getAttribute('data-addr');
          const worker = state.workers.find(w => w.addr === addr);
          if (worker) {
            const reqHours = worker.targetHours || state.terminalHours || 8;
            worker.checkInTimestamp = Date.now() - (reqHours * 3600000 + 60000);
            worker.checkInTime = '08:00';
            saveState();
            renderTerminalWorkersTable();
            toast('⚡ ' + worker.name + ' çalışma süresi ' + reqHours + ' saat olarak ayarlandı. Artık çıkış yapılabilir!', 'info');
          }
          return;
        }

// Nakit çekim işlemi işçinin kendi mobil uygulamasında (ShiftPay Mobile) 30 gün vade dolunca yapılır.
      });
    }

    attachWorkerTableEvents('#terminal-workers-tbody');
    attachWorkerTableEvents('#mgmt-workers-tbody');

    /* POS Amount Input Realtime Update */
    const inpPosAmount = $('#inp-pos-amount');
    if (inpPosAmount) {
      inpPosAmount.addEventListener('input', drawMerchantPosQr);
    }

    /* Simulate Merchant Payment */
    const btnSimPay = $('#btn-simulate-payment');
    if (btnSimPay) {
      btnSimPay.addEventListener('click', function() {
        const amount = parseFloat($('#inp-pos-amount').value) || 180;
        processUnifiedQrScan({
          protocol: 'shiftpay',
          type: 'MERCHANT_PAY',
          amount_try: amount
        });
      });
    }

    /* Universal QR Scanner Modal Triggers */
    const btnTopScanEmp = $('#btn-topbar-scan-emp');
    if (btnTopScanEmp) btnTopScanEmp.addEventListener('click', openScannerModal);

    const btnTopScanMrc = $('#btn-topbar-scan-mrc');
    if (btnTopScanMrc) btnTopScanMrc.addEventListener('click', openScannerModal);

    const btnOpenScanEmp = $('#btn-open-scanner-emp');
    if (btnOpenScanEmp) btnOpenScanEmp.addEventListener('click', openScannerModal);

    const btnOpenScanMrc = $('#btn-open-scanner-mrc');
    if (btnOpenScanMrc) btnOpenScanMrc.addEventListener('click', openScannerModal);

    const btnCloseScanner = $('#btn-close-scanner');
    if (btnCloseScanner) btnCloseScanner.addEventListener('click', closeScannerModal);

    /* Modal Backdrop Click */
    const modalBackdrop = $('#qr-scanner-modal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', function(e) {
        if (e.target === this) closeScannerModal();
      });
    }

    /* Scanner Modal Tabs */
    $$('.scanner-tab-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        $$('.scanner-tab-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const targetTab = this.getAttribute('data-tab');

        $$('.scanner-tab-content').forEach(c => {
          c.classList.remove('active');
          c.style.display = 'none';
        });

        const activeContent = $('#' + targetTab);
        if (activeContent) {
          activeContent.classList.add('active');
          activeContent.style.display = 'block';
        }

        if (targetTab === 'tab-camera') {
          startCamera();
        } else {
          stopCamera();
        }
      });
    });

    /* Camera buttons */
    const btnStartCam = $('#btn-start-camera');
    if (btnStartCam) btnStartCam.addEventListener('click', startCamera);

    const btnStopCam = $('#btn-stop-camera');
    if (btnStopCam) btnStopCam.addEventListener('click', stopCamera);

    /* File QR Scanner */
    const inpQrFile = $('#inp-qr-file');
    if (inpQrFile) {
      inpQrFile.addEventListener('change', async function(e) {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        try {
          if (!html5Scanner) html5Scanner = new Html5Qrcode('qr-reader-video');
          const decodedText = await html5Scanner.scanFile(file, true);
          processUnifiedQrScan(decodedText);
        } catch (err) {
          toast('Görselden QR okunamadı: ' + (err || 'Bilinmeyen hata'), 'error');
        }
      });
    }

    /* Quick Test buttons inside Scanner Modal */
    const btnQuickCheckin = $('#btn-quick-scan-checkin');
    if (btnQuickCheckin) {
      btnQuickCheckin.addEventListener('click', function() {
        processUnifiedQrScan({
          protocol: 'shiftpay',
          type: 'CHECK_IN',
          daily_wage_try: state.terminalWage,
          target_hours: state.terminalHours,
          shift_id: state.terminalShiftId,
          date: state.terminalDate
        });
      });
    }

    const btnQuickCheckout = $('#btn-quick-scan-checkout');
    if (btnQuickCheckout) {
      btnQuickCheckout.addEventListener('click', function() {
        processUnifiedQrScan({
          protocol: 'shiftpay',
          type: 'CHECK_OUT',
          shift_id: state.terminalShiftId,
          date: state.terminalDate
        });
      });
    }

    const btnQuickMerchant = $('#btn-quick-scan-merchant');
    if (btnQuickMerchant) {
      btnQuickMerchant.addEventListener('click', function() {
        processUnifiedQrScan({
          protocol: 'shiftpay',
          type: 'MERCHANT_PAY',
          amount_try: state.posAmount || 180
        });
      });
    }

    /* Deposit Form */
    const formDeposit = $('#form-emp-deposit');
    if (formDeposit) {
      formDeposit.addEventListener('submit', function(e) {
        e.preventDefault();
        const amount = parseFloat($('#inp-deposit-amount').value);
        const lockDays = parseInt($('#inp-deposit-lock').value);
        const useDefindex = $('#inp-defindex-auto').checked;

        if (amount < 100) { toast('Minimum 100 USDC', 'error'); return; }

        state.employerLocked += amount;
        state.employerLockDays = lockDays;
        state.autoCompound = useDefindex;
        saveState();
        updateEmployerStats();
        runCompoundSimulator();
        toast(amount + ' USDC teminat kilitlendi ve DeFindex Vaulta aktarıldı!', 'success');

        const termBtn = $('#screen-employer').querySelector('[data-panel="emp-terminal"]');
        if (termBtn) termBtn.click();
      });
    }

    /* Withdraw Form */
    const formWithdraw = $('#form-mrc-withdraw');
    if (formWithdraw) {
      formWithdraw.addEventListener('submit', function(e) {
        e.preventDefault();
        const amount = parseFloat($('#inp-withdraw-amount').value);
        const iban = $('#inp-withdraw-iban').value.trim();

        if (amount > state.merchantBalance) {
          toast('Yetersiz bakiye! Mevcut bakiye: ' + state.merchantBalance.toFixed(2) + ' TRY', 'error');
          return;
        }

        state.merchantBalance -= amount;
        state.merchantWithdrawn += amount;
        saveState();
        updateMerchantStats();
        toast(amount.toFixed(2) + ' TRY başarıyla ' + iban.substring(0, 8) + '... hesabına aktarıldı!', 'success');
        $('#inp-withdraw-amount').value = '';
        $('#inp-withdraw-iban').value = '';
      });
    }

    /* Logout */
    function logout() {
      Object.assign(state, {
        user: null, workers: [], shifts: [], merchantTx: [],
        merchantBalance: 0, merchantWithdrawn: 0, employerLocked: 10000, employerSpent: 0, employerYield: 14.8520
      });
      saveState();
      showScreen('screen-login');
      toast('Çıkış yapıldı.', 'info');
    }

    const btnEmpLogout = $('#btn-employer-logout');
    if (btnEmpLogout) btnEmpLogout.addEventListener('click', logout);
    const btnMrcLogout = $('#btn-merchant-logout');
    if (btnMrcLogout) btnMrcLogout.addEventListener('click', logout);

    initSidebar('screen-employer');
    initSidebar('screen-merchant');
  }

  function initSidebar(screenId) {
    const screen = $('#' + screenId);
    if (!screen) return;
    const btns = screen.querySelectorAll('.sidebar-btn');
    const panels = screen.querySelectorAll('.panel');

    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panelId = btn.getAttribute('data-panel');
        const target = screen.querySelector('#' + panelId);
        if (target) target.classList.add('active');

        if (panelId === 'emp-terminal') drawEmployerTerminalQr();
        if (panelId === 'emp-workers') renderTerminalWorkersTable();
        if (panelId === 'mrc-pos') drawMerchantPosQr();
      });
    });
  }

  // Ensure execution once
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouting);
  } else {
    initRouting();
  }
})();
