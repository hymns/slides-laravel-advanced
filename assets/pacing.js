/*
 * Pemasa trainer — elak over run.
 *
 * - Setiap <section> ada data-timing="saat" (bajet slide). Speaker view (S) juga guna nilai ini.
 * - Tekan T untuk papar/sembunyi pemasa. Shift+T untuk set semula jam sesi.
 * - Jam sesi bermula bila anda pertama kali beralih dari slide pertama (atau selepas Shift+T).
 *   Shift+T set semula jadual bermula dari slide semasa: sesuai untuk mula semula atau sambung selepas rehat.
 * - Elemen [data-countdown] dalam slide aktif akan kira detik ke bawah dari bajet slide itu
 *   (cth. slide Rehat dan Lab).
 */
(function () {
  const KEY = 'pacing:' + location.pathname;
  const store = {
    get() { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    set(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };

  const fmt = (sec) => {
    const neg = sec < 0; sec = Math.abs(Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(s).padStart(2, '0');
    return (neg ? '-' : '') + (h ? h + ':' : '') + mm + ':' + ss;
  };

  const css = `
  .pacing { position: fixed; top: 14px; right: 14px; z-index: 40; width: 250px; font: 13px/1.35 var(--font, system-ui);
    background: rgba(21,26,35,.94); border: 1px solid #2a3140; border-radius: 12px; padding: 10px 12px; color: #e8ecf3;
    box-shadow: 0 8px 24px rgba(0,0,0,.45); display: none; }
  .pacing.on { display: block; }
  .pacing .row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .pacing .lbl { color: #9aa5b8; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
  .pacing .big { font-family: var(--mono, monospace); font-size: 18px; font-weight: 700; }
  .pacing .bar { height: 5px; background: #2a3140; border-radius: 3px; margin: 6px 0 8px; overflow: hidden; }
  .pacing .bar i { display: block; height: 100%; width: 0; background: #4cc47f; transition: width .5s linear, background .3s; }
  .pacing .status { font-weight: 600; }
  .pacing .ok { color: #4cc47f; } .pacing .warn { color: #f0a91f; } .pacing .late { color: #ff6b6b; }
  .pacing .hint { color: #5b6678; font-size: 10px; margin-top: 6px; }
  [data-countdown] { font-family: var(--mono, monospace); font-variant-numeric: tabular-nums; }
  `;

  function init(Reveal) {
    // tunggu Reveal siap sepenuhnya sebelum sentuh DOM / slide semasa
    if (Reveal.isReady()) setup(Reveal); else Reveal.on('ready', () => setup(Reveal));
  }

  function setup(Reveal) {
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    const el = document.createElement('div');
    el.className = 'pacing';
    el.innerHTML = `
      <div class="row"><span class="lbl">Slide ini</span><span class="big" data-p="slide">0:00</span></div>
      <div class="row"><span class="lbl">Bajet</span><span data-p="budget">0:00</span></div>
      <div class="bar"><i data-p="bar"></i></div>
      <div class="row"><span class="lbl">Sesi</span><span class="big" data-p="session">0:00</span></div>
      <div class="row"><span class="lbl">Jadual</span><span class="status" data-p="status">—</span></div>
      <div class="row"><span class="lbl">Baki modul</span><span data-p="left">0:00</span></div>
      <div class="hint">T: papar/sembunyi · Shift+T: set semula jam sesi</div>`;
    document.body.appendChild(el);
    const q = (k) => el.querySelector(`[data-p="${k}"]`);

    const slides = Reveal.getSlides();
    const budgetOf = (s) => parseInt(s.getAttribute('data-timing') || '0', 10);
    const plannedStart = []; let acc = 0;
    slides.forEach((s, i) => { plannedStart[i] = acc; acc += budgetOf(s); });
    const total = acc;

    let state = store.get();
    let slideEnteredAt = Date.now();
    if (state.visible) el.classList.add('on');

    // offset = masa dirancang untuk slide tempat sesi dimulakan
    const startSession = () => {
      const cur = Reveal.getCurrentSlide();
      state.start = Date.now();
      state.offset = cur ? plannedStart[slides.indexOf(cur)] : 0;
      store.set(state);
    };
    const resetSession = () => { startSession(); slideEnteredAt = Date.now(); tick(); };

    Reveal.on('slidechanged', (e) => {
      slideEnteredAt = Date.now();
      if (!state.start && Reveal.getIndices().h > 0) startSession();
      tick();
    });

    Reveal.addKeyBinding({ keyCode: 84, key: 'T', description: 'Papar/sembunyi pemasa' }, () => {
      state.visible = !el.classList.contains('on'); el.classList.toggle('on', state.visible); store.set(state);
      tick();
    });

    // Reveal abaikan kekunci + Shift (bukan kekunci navigasi), jadi Shift+T ditangkap terus di sini.
    document.addEventListener('keydown', (ev) => {
      if (!ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key !== 'T' && ev.keyCode !== 84) return;
      const t = ev.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      ev.preventDefault();
      resetSession();
    }, true);

    function tick() {
      const cur = Reveal.getCurrentSlide();
      if (!cur) return;
      const idx = slides.indexOf(cur);
      const budget = budgetOf(cur);
      const onSlide = (Date.now() - slideEnteredAt) / 1000;

      // kira detik untuk slide Rehat / Lab
      cur.querySelectorAll('[data-countdown]').forEach((c) => {
        const left = budget - onSlide;
        c.textContent = fmt(Math.max(left, 0));
        c.style.color = left <= 0 ? '#ff6b6b' : left <= 120 ? '#f0a91f' : '';
      });

      if (!el.classList.contains('on')) return;

      q('slide').textContent = fmt(onSlide);
      q('budget').textContent = fmt(budget);
      const pct = budget ? Math.min(onSlide / budget, 1) : 0;
      const bar = q('bar');
      bar.style.width = (pct * 100) + '%';
      bar.style.background = onSlide > budget ? '#ff6b6b' : pct > .8 ? '#f0a91f' : '#4cc47f';
      q('slide').className = 'big ' + (onSlide > budget ? 'late' : pct > .8 ? 'warn' : '');

      const st = q('status');
      if (!state.start) {
        q('session').textContent = '0:00';
        st.textContent = 'belum mula'; st.className = 'status';
        q('left').textContent = fmt(total);
        return;
      }
      const elapsed = (Date.now() - state.start) / 1000;
      q('session').textContent = fmt(elapsed);
      // jadual: masa sebenar berbanding masa dirancang (awal slide + bajet yang sudah digunakan, maks bajet)
      const planned = plannedStart[idx] + Math.min(onSlide, budget);
      const diff = (state.offset || 0) + elapsed - planned;
      const mins = Math.round(Math.abs(diff) / 60);
      if (mins < 2) { st.textContent = 'Ikut jadual'; st.className = 'status ok'; }
      else if (diff > 0) { st.textContent = `Lewat ${mins} min`; st.className = 'status ' + (mins >= 5 ? 'late' : 'warn'); }
      else { st.textContent = `Awal ${mins} min`; st.className = 'status ok'; }
      q('left').textContent = fmt(Math.max(total - (state.offset || 0) - elapsed, 0));
    }

    setInterval(tick, 1000);
    tick();
  }

  window.RevealPacing = { id: 'pacing', init };
})();
