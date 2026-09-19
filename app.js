/* ===== ShiftPay App Logic with DeFindex Compound Yield Engine ===== */
(function() {
  'use strict';

  // ===== STATE =====
  const state = {
    user: null,             // { name, email, avatar, role, wallet, id }
    workers: [
      { addr: 'GDKF5...4K2L', name: 'Ahmet Yilmaz', wage: 1200 },
      { addr: 'GBBC2...9X1M', name: 'Mehmet Kaya', wage: 1350 },
      { addr: 'GC3X8...7P9Q', name: 'Can Demir', wage: 1100 }
    ],
    shifts: [],             // employer's shift records
    merchantTx: [],         // merchant's transactions
    merchantBalance: 0,
    merchantWithdrawn: 0,
    employerLocked: 10000,  // initial default locked vault
    employerSpent: 0,       // total wages paid out
    employerYield: 14.8520, // accumulated compound yield
    employerLockDays: 30,
    autoCompound: true,
    apy: 0.1145             // 11.45% DeFindex APY
  };

  // ===== HELPERS =====
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
    $('#toast-container').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  function saveState() {
    try { localStorage.setItem('shiftpay_state', JSON.stringify(state)); } catch(e) {}
  }

  function loadState() {
    try {
      const saved = localStorage.getItem('shiftpay_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(state, parsed);
      }
    } catch(e) {}
  }

  // ===== SCREEN ROUTING =====
  function initRouting() {
    loadState();
    if (state.user && state.user.role) {
      if (state.user.role === 'employer') {
        enterEmployerDashboard();
      } else {
        enterMerchantDashboard();
      }
    } else if (state.user) {
      showScreen('screen-role');
      const nameEl = $('#role-user-name');
      if (nameEl) nameEl.textContent = state.user.name;
    } else {
      showScreen('screen-login');
    }
  }

  // ===== PRIVY REAL AUTH CALLBACK =====
  window.onPrivyLoginSuccess = function(userData) {
    state.user = {
      name: userData.name || 'Kullanici',
      email: userData.email || '',
      wallet: userData.wallet || '',
      id: userData.id,
      role: state.user?.role || null
    };
    saveState();

    if (state.user.role === 'employer') {
      enterEmployerDashboard();
    } else if (state.user.role === 'merchant') {
      enterMerchantDashboard();
    } else {
      showScreen('screen-role');
      const nameEl = $('#role-user-name');
      if (nameEl) nameEl.textContent = state.user.name;
    }
    toast('Giris basarili: ' + state.user.name, 'success');
  };

  // ===== ROLE SELECTION =====
  const roleEmpBtn = $('#role-employer');
  if (roleEmpBtn) {
    roleEmpBtn.addEventListener('click', function() {
      state.user.role = 'employer';
      saveState();
      enterEmployerDashboard();
      toast('Isveren paneline hos geldiniz.', 'success');
    });
  }

  const roleMrcBtn = $('#role-merchant');
  if (roleMrcBtn) {
    roleMrcBtn.addEventListener('click', function() {
      state.user.role = 'merchant';
      saveState();
      enterMerchantDashboard();
      toast('Esnaf paneline hos geldiniz.', 'success');
    });
  }

  // ===== EMPLOYER DASHBOARD =====
  function enterEmployerDashboard() {
    showScreen('screen-employer');
    const nameEl = $('#employer-topbar-name');
    if (nameEl && state.user) nameEl.textContent = state.user.name;
    updateEmployerStats();
    renderWorkersTable();
    renderShiftsTable();
    runCompoundSimulator();
    startLiveYieldStream();
  }

  function updateEmployerStats() {
    const lockedEl = $('#emp-stat-locked');
    if (lockedEl) lockedEl.textContent = state.employerLocked.toFixed(2) + ' USDC';

    const yieldEl = $('#emp-stat-yield');
    if (yieldEl) yieldEl.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';

    const spentEl = $('#emp-stat-spent');
    if (spentEl) spentEl.textContent = state.employerSpent.toFixed(2) + ' USDC';

    const workersEl = $('#emp-stat-workers');
    if (workersEl) workersEl.textContent = state.workers.length;

    const princEl = $('#defindex-principal');
    if (princEl) princEl.textContent = state.employerLocked.toFixed(2) + ' USDC';

    const earnedEl = $('#defindex-earned');
    if (earnedEl) earnedEl.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';
  }

  // ===== LIVE YIELD STREAM TICKER =====
  let streamInterval = null;
  function startLiveYieldStream() {
    if (streamInterval) clearInterval(streamInterval);

    streamInterval = setInterval(() => {
      if (state.employerLocked > 0 && state.autoCompound) {
        // Daily yield = principal * (APY / 365)
        // Per-second yield = daily yield / 86400
        const perSec = (state.employerLocked * (state.apy / 365)) / 86400;
        const tick = perSec * 0.25; // 250ms tick
        state.employerYield += tick;

        const streamCounter = $('#live-stream-counter');
        if (streamCounter) {
          streamCounter.textContent = '+' + state.employerYield.toFixed(6) + ' USDC';
        }

        const yieldStat = $('#emp-stat-yield');
        if (yieldStat) {
          yieldStat.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';
        }

        const earnedStat = $('#defindex-earned');
        if (earnedStat) {
          earnedStat.textContent = '+' + state.employerYield.toFixed(4) + ' USDC';
        }

        const speedStat = $('#defindex-speed');
        if (speedStat) {
          speedStat.textContent = '+' + perSec.toFixed(6) + ' USDC / sn';
        }
      }
    }, 250);
  }

  // ===== DEFINDEX COMPOUND SIMULATOR =====
  function runCompoundSimulator() {
    const amountInp = $('#inp-deposit-amount');
    const lockInp = $('#inp-deposit-lock');
    if (!amountInp || !lockInp) return;

    const P = parseFloat(amountInp.value) || 10000;
    const days = parseInt(lockInp.value) || 30;
    const dailyPayout = P / days;
    const dailyRate = state.apy / 365;

    let remaining = P;
    let totalYield = 0;
    const tableRows = [];

    for (let d = 1; d <= days; d++) {
      // Yield on remaining capital for this day
      const dayYield = remaining * dailyRate;
      totalYield += dayYield;

      if (d === 1 || d === 5 || d === 10 || d === 15 || d === 20 || d === 25 || d === days) {
        tableRows.push({
          day: d,
          rem: remaining,
          daily: dayYield,
          cum: totalYield
        });
      }

      // Worker payout at end of day
      remaining = Math.max(0, remaining - dailyPayout);
    }

    const simLockedEl = $('#sim-total-locked');
    if (simLockedEl) simLockedEl.textContent = P.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' USDC';

    const simPayoutEl = $('#sim-daily-payout');
    if (simPayoutEl) simPayoutEl.textContent = dailyPayout.toFixed(2) + ' USDC / gun';

    const simYieldEl = $('#sim-total-yield');
    if (simYieldEl) simYieldEl.textContent = '+' + totalYield.toFixed(2) + ' USDC';

    const simSavingsEl = $('#sim-savings-rate');
    const savingsPct = (totalYield / P) * 100;
    if (simSavingsEl) simSavingsEl.textContent = '%' + savingsPct.toFixed(2) + ' Maas Tasarrufu';

    const tbody = $('#sim-tbody');
    if (tbody) {
      tbody.innerHTML = tableRows.map(r => {
        return '<tr>' +
          '<td><strong>Gun ' + r.day + '</strong></td>' +
          '<td class="mono">' + r.rem.toFixed(2) + ' USDC</td>' +
          '<td class="mono text-green">+' + r.daily.toFixed(4) + ' USDC</td>' +
          '<td class="mono text-cyan font-bold">+' + r.cum.toFixed(2) + ' USDC</td>' +
          '</tr>';
      }).join('');
    }
  }

  // Simulator input listener
  const depositInp = $('#inp-deposit-amount');
  if (depositInp) depositInp.addEventListener('input', runCompoundSimulator);
  const lockInp = $('#inp-deposit-lock');
  if (lockInp) lockInp.addEventListener('change', runCompoundSimulator);

  // ===== SIDEBAR NAVIGATION =====
  function initSidebar(dashboardId) {
    const screen = $('#' + dashboardId);
    if (!screen) return;
    screen.querySelectorAll('.sidebar-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const panelId = this.getAttribute('data-panel');
        screen.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        screen.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        const panel = $('#' + panelId);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ===== DEPOSIT FORM SUBMIT =====
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
      toast(amount + ' USDC teminat kilitlendi ve DeFindex Vaulta aktarildi!', 'success');

      // Navigate to overview
      const overviewBtn = $('#screen-employer').querySelector('[data-panel="emp-overview"]');
      if (overviewBtn) overviewBtn.click();
    });
  }

  // ===== END OF DAY PAYOUT (CHECK-OUT ACTION) =====
  const btnEndShift = $('#btn-end-day-shift');
  if (btnEndShift) {
    btnEndShift.addEventListener('click', function() {
      // Calculate daily wage in USDC (assuming ~35 TRY/USDC exchange)
      const totalDailyWageTRY = state.workers.reduce((sum, w) => sum + (w.wage || 1200), 0);
      const dailyWageUSDC = parseFloat((totalDailyWageTRY / 35).toFixed(2));

      if (state.employerLocked < dailyWageUSDC) {
        toast('Kasadaki bakiye yetersiz (' + state.employerLocked.toFixed(2) + ' USDC)! Lutfen bakiye yukleyin.', 'error');
        return;
      }

      // Deduct from locked budget, add to spent
      state.employerLocked -= dailyWageUSDC;
      state.employerSpent += dailyWageUSDC;

      // Add shift records for each worker
      const now = new Date();
      const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      state.workers.forEach(w => {
        state.shifts.unshift({
          worker: w.name,
          date: 'Bugun (' + timeStr + ')',
          duration: '8 Saat (Tam Gun)',
          earned: w.wage + ' TRY (~' + (w.wage / 35).toFixed(1) + ' USDC)',
          remLocked: state.employerLocked.toFixed(2) + ' USDC',
          status: 'done'
        });
      });

      saveState();
      updateEmployerStats();
      renderShiftsTable();
      toast(
        'Gunun vardiyasi kapatildi! ' + dailyWageUSDC + ' USDC dagitildi. Kalan ' + state.employerLocked.toFixed(2) + ' USDC DeFindexte bilesik faiz kazanmaya devam ediyor!',
        'success'
      );
    });
  }

  // ===== WORKERS MANAGEMENT =====
  function renderWorkersTable() {
    const tbody = $('#workers-tbody');
    if (!tbody) return;
    if (state.workers.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Henuz isci eklenmedi.</td></tr>';
      return;
    }
    tbody.innerHTML = state.workers.map(w => {
      return '<tr>' +
        '<td>' + w.name + '</td>' +
        '<td class="mono">' + w.addr + '</td>' +
        '<td>' + w.wage + ' TRY</td>' +
        '<td><span class="badge badge-active">Aktif</span></td>' +
        '</tr>';
    }).join('');
  }

  const formWorker = $('#form-add-worker');
  if (formWorker) {
    formWorker.addEventListener('submit', function(e) {
      e.preventDefault();
      const addr = $('#inp-worker-addr').value.trim();
      const name = $('#inp-worker-name').value.trim();
      const wage = parseFloat($('#inp-worker-wage').value);

      if (!addr.startsWith('G') || addr.length < 15) {
        toast('Gecerli bir Stellar cüzdan adresi girin (G...)', 'error');
        return;
      }

      state.workers.push({ addr: addr, name: name, wage: wage });
      saveState();
      renderWorkersTable();
      updateEmployerStats();
      toast(name + ' basariyla kaydedildi!', 'success');
      this.reset();
      $('#inp-worker-wage').value = '1200';
    });
  }

  // ===== SHIFTS TABLE =====
  function renderShiftsTable() {
    const tbody = $('#shifts-tbody');
    if (!tbody) return;
    if (state.shifts.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Henuz kapatilmis vardiya kaydi yok. Ustteki "Gunu Kapat" butonuna basarak deneyin.</td></tr>';
      return;
    }
    tbody.innerHTML = state.shifts.map(s => {
      return '<tr>' +
        '<td><strong>' + s.worker + '</strong></td>' +
        '<td>' + s.date + '</td>' +
        '<td>' + s.duration + '</td>' +
        '<td class="text-green font-bold">' + s.earned + '</td>' +
        '<td class="mono">' + s.remLocked + '</td>' +
        '<td><span class="badge badge-done">Tamamlandi &amp; Odendi</span></td>' +
        '</tr>';
    }).join('');
  }

  // ===== CLAIM YIELD BUTTON =====
  const btnClaim = $('#btn-claim-yield');
  if (btnClaim) {
    btnClaim.addEventListener('click', function() {
      if (state.employerYield <= 0) {
        toast('Henuz birikmis getiri yok.', 'error');
        return;
      }
      const claimed = state.employerYield;
      state.employerYield = 0;
      saveState();
      updateEmployerStats();
      toast('Tebrikler! ' + claimed.toFixed(4) + ' USDC DeFindex bilesik getirisi Stellar cuzdaniniza aktarildi.', 'success');
    });
  }

  // ===== REINVEST BUTTON =====
  const btnReinvest = $('#btn-reinvest-yield');
  if (btnReinvest) {
    btnReinvest.addEventListener('click', function() {
      state.employerLocked += state.employerYield;
      state.employerYield = 0;
      saveState();
      updateEmployerStats();
      toast('Getiri anaparaya eklendi! Bilesik getiri carpaniniz yukseldi.', 'success');
    });
  }

  // ===== MERCHANT DASHBOARD =====
  function enterMerchantDashboard() {
    showScreen('screen-merchant');
    const nameEl = $('#merchant-topbar-name');
    if (nameEl && state.user) nameEl.textContent = state.user.name;
    updateMerchantStats();
    renderMerchantTx();
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
    if (!tbody) return;
    if (state.merchantTx.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="4">Henuz islem yok.</td></tr>';
      return;
    }
    tbody.innerHTML = state.merchantTx.map(tx => {
      return '<tr><td>' + new Date(tx.date).toLocaleString('tr-TR') + '</td><td>' + tx.worker + '</td><td>' + tx.amount.toFixed(2) + ' TRY</td><td><span class="badge badge-done">Onaylandi</span></td></tr>';
    }).join('');
  }

  // ===== SIMULATE MERCHANT PAYMENT =====
  const btnSimPay = $('#btn-simulate-payment');
  if (btnSimPay) {
    btnSimPay.addEventListener('click', function() {
      const amount = parseFloat($('#inp-pos-amount').value) || 180;
      const workerNames = ['Ahmet Yilmaz', 'Mehmet Kaya', 'Can Demir', 'Ayse Celik', 'Fatma Oz'];
      const randomWorker = workerNames[Math.floor(Math.random() * workerNames.length)];

      state.merchantTx.unshift({
        date: new Date().toISOString(),
        worker: randomWorker,
        amount: amount
      });
      state.merchantBalance += amount;
      saveState();
      updateMerchantStats();
      renderMerchantTx();
      toast(amount + ' TRY odeme alindi (' + randomWorker + ')', 'success');
    });
  }

  // ===== QR GENERATE =====
  const btnGenQr = $('#btn-generate-qr');
  if (btnGenQr) {
    btnGenQr.addEventListener('click', function() {
      const amount = parseFloat($('#inp-pos-amount').value) || 180;
      toast('POS QR Kod olusturuldu: ' + amount + ' TRY', 'info');
    });
  }

  // ===== MERCHANT WITHDRAW =====
  const formWithdraw = $('#form-mrc-withdraw');
  if (formWithdraw) {
    formWithdraw.addEventListener('submit', function(e) {
      e.preventDefault();
      const amount = parseFloat($('#inp-withdraw-amount').value);
      const iban = $('#inp-withdraw-iban').value.trim();

      if (amount > state.merchantBalance) {
        toast('Yetersiz bakiye!', 'error');
        return;
      }
      if (!iban.startsWith('TR') || iban.length < 10) {
        toast('Gecerli bir TR IBAN girin.', 'error');
        return;
      }

      state.merchantBalance -= amount;
      state.merchantWithdrawn += amount;
      saveState();
      updateMerchantStats();
      toast(amount + ' TRY Turk Anchor uzerinden IBANiniza aktarildi.', 'success');
      this.reset();
    });
  }

  // ===== LOGOUT =====
  function logout() {
    if (streamInterval) clearInterval(streamInterval);
    localStorage.removeItem('shiftpay_state');
    if (window.privyLogout) {
      window.privyLogout();
    }
    Object.assign(state, {
      user: null, shifts: [], merchantTx: [],
      merchantBalance: 0, merchantWithdrawn: 0, employerLocked: 10000, employerSpent: 0, employerYield: 14.8520
    });
    showScreen('screen-login');
    toast('Cikis yapildi.', 'info');
  }

  const btnEmpLogout = $('#btn-employer-logout');
  if (btnEmpLogout) btnEmpLogout.addEventListener('click', logout);
  const btnMrcLogout = $('#btn-merchant-logout');
  if (btnMrcLogout) btnMrcLogout.addEventListener('click', logout);

  // ===== INIT =====
  initSidebar('screen-employer');
  initSidebar('screen-merchant');
  initRouting();

})();
