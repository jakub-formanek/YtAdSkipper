/*
 * YT Ad Skipper – content script
 *
 * Princip: přehrávač YouTube má během reklamy na elementu .html5-video-player
 * třídu "ad-showing" (případně "ad-interrupting"). Jakmile ji uvidíme:
 *   1. ztlumíme video a zrychlíme ho na 16×,
 *   2. krátkou reklamu přetočíme rovnou na konec,
 *   3. klikneme na tlačítko „Přeskočit“, pokud je vidět.
 * Po skončení reklamy vrátíme původní hlasitost a rychlost.
 *
 * Nic se neblokuje na úrovni sítě – YouTube tak nemá důvod hlásit „ad blocker“.
 *
 * Selektory jsou v selectors.js (self.YTAS_SELECTORS). Tady je jen logika.
 */
(() => {
  'use strict';

  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const SEL = self.YTAS_SELECTORS;
  if (!SEL) {
    console.error('[YTAS] chybí selectors.js – zkontroluj pořadí v manifest.json');
    return;
  }

  // --- nastavení ---------------------------------------------------------
  const TICK_MS = 250;          // jak často kontrolujeme přehrávač
  const AD_RATE = 16;           // rychlost přehrávání reklamy
  // Přetáčet na konec jen „krátká“ videa. Při vkládání reklam na straně serveru
  // (SSAI) je reklama součástí streamu celého videa – kdybychom přetočili na konec,
  // přeskočili bychom i obsah. Proto limit; delší úseky jen zrychlujeme.
  const MAX_SEEK_DURATION = 120; // s

  // --- stav --------------------------------------------------------------
  let enabled = true;
  let debug = false;
  let inAd = false;
  let saved = null;        // { video, muted, rate }
  let pendingCount = 0;    // počet reklam k připsání do statistiky

  const log = (...a) => { if (debug) console.log('[YTAS]', ...a); };

  // --- úložiště (zapnuto/vypnuto, debug, počítadlo) ----------------------
  function storageGet(defaults) {
    if (!api || !api.storage) return Promise.resolve(defaults);
    try {
      const r = api.storage.local.get(defaults);
      if (r && typeof r.then === 'function') return r;
      return new Promise((res) => api.storage.local.get(defaults, res));
    } catch (e) {
      return Promise.resolve(defaults);
    }
  }

  storageGet({ enabled: true, debug: false }).then((v) => {
    enabled = v.enabled !== false;
    debug = v.debug === true;
  });

  if (api && api.storage && api.storage.onChanged) {
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.enabled) enabled = changes.enabled.newValue !== false;
      if (changes.debug) debug = changes.debug.newValue === true;
    });
  }

  let flushTimer = null;
  function countAd() {
    pendingCount++;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const n = pendingCount;
      pendingCount = 0;
      storageGet({ skipped: 0 }).then((v) => {
        try { api.storage.local.set({ skipped: (v.skipped || 0) + n }); } catch (e) { /* ignore */ }
      });
    }, 1000);
  }

  // --- pomocné funkce ----------------------------------------------------
  function isVisible(el) {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (el.offsetParent === null && s.position !== 'fixed') return false;
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function queryFirst(root, selectors) {
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Vrátí selektor, přes který se kliklo, nebo null.
  function clickFirst(root, selectors) {
    for (const sel of selectors) {
      for (const el of root.querySelectorAll(sel)) {
        if (isVisible(el)) {
          el.click();
          return sel;
        }
      }
    }
    return null;
  }

  const getPlayer = () => queryFirst(document, SEL.PLAYER);
  const getVideo = (player) => queryFirst(player, SEL.VIDEO);
  const isAdShowing = (player) => SEL.AD_CLASSES.some((c) => player.classList.contains(c));

  // --- logika reklam -----------------------------------------------------
  function startAd(video) {
    inAd = true;
    saved = {
      video,
      muted: video.muted,
      rate: (video.playbackRate && video.playbackRate !== AD_RATE) ? video.playbackRate : 1
    };
    countAd();
    log('reklama začala, délka', video.duration);
  }

  function handleAd(video, player) {
    // Pokud YouTube mezi reklamami vymění <video>, uložíme stav znovu.
    if (saved && saved.video !== video) {
      saved = { video, muted: saved.muted, rate: saved.rate };
    }

    if (!video.muted) video.muted = true;
    try {
      if (video.playbackRate !== AD_RATE) video.playbackRate = AD_RATE;
    } catch (e) { /* některé prohlížeče omezují rozsah */ }

    const d = video.duration;
    if (Number.isFinite(d) && d > 0 && d <= MAX_SEEK_DURATION && video.currentTime < d - 0.5) {
      try { video.currentTime = d - 0.1; } catch (e) { /* ignore */ }
    }

    if (video.paused && video.readyState >= 2) {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }

    const hit = clickFirst(player, SEL.SKIP_BUTTON);
    if (hit) log('kliknuto na Přeskočit přes', hit);
  }

  function endAd(video) {
    inAd = false;
    const s = saved;
    saved = null;
    log('reklama skončila');
    if (!s) return;
    const v = video || s.video;
    if (!v) return;
    try {
      if (v.playbackRate === AD_RATE) v.playbackRate = s.rate || 1;
      v.muted = s.muted;
    } catch (e) { /* ignore */ }
  }

  function tick() {
    const player = getPlayer();
    if (!player) return;
    const video = getVideo(player);

    if (!enabled) {
      if (inAd) endAd(video);
      return;
    }

    if (isAdShowing(player) && video) {
      if (!inAd) startAd(video);
      handleAd(video, player);
    } else if (inAd) {
      endAd(video);
    }

    // Překryvné (bannerové) reklamy přes video
    const hit = clickFirst(player, SEL.OVERLAY_CLOSE);
    if (hit) log('zavřen overlay přes', hit);
  }

  /*
   * Diagnostika pro hledání nových selektorů – viz CLAUDE.md.
   * Ve Firefoxu se exportuje do stránky, takže když běží reklama, stačí
   * ve webové konzoli (F12) na youtube.com zavolat:
   *   ytasDiagnose()
   * Případně v okénku doplňku zapnout „Ladicí výpis“ a sledovat řádky [YTAS].
   */
  function diagnose() {
    const player = getPlayer();
    const out = {
      player: player ? (player.id || player.className) : null,
      playerClasses: player ? [...player.classList] : [],
      adShowing: player ? isAdShowing(player) : false,
      video: null,
      skipCandidates: [],
      matchedSkipSelector: null
    };
    if (!player) return out;
    const v = getVideo(player);
    if (v) out.video = { duration: v.duration, currentTime: v.currentTime, rate: v.playbackRate, muted: v.muted };
    // Kandidáti: tlačítka uvnitř přehrávače, jejichž třída/id/text zmiňuje skip/přeskočit
    for (const el of player.querySelectorAll('button, [role="button"]')) {
      const txt = (el.textContent || '').trim().slice(0, 40);
      const sig = `${el.id} ${el.className} ${txt}`.toLowerCase();
      if (/skip|přeskoč|preskoc/.test(sig)) {
        out.skipCandidates.push({ tag: el.tagName.toLowerCase(), id: el.id, class: String(el.className), text: txt, visible: isVisible(el) });
      }
    }
    for (const sel of SEL.SKIP_BUTTON) {
      if (player.querySelector(sel)) { out.matchedSkipSelector = sel; break; }
    }
    return out;
  }

  setInterval(tick, TICK_MS);

  // Rychlejší reakce: jakmile se změní třída přehrávače, zkontrolujeme hned.
  let observedPlayer = null;
  const classObserver = new MutationObserver(() => tick());
  setInterval(() => {
    const p = getPlayer();
    if (p && p !== observedPlayer) {
      classObserver.disconnect();
      classObserver.observe(p, { attributes: true, attributeFilter: ['class'] });
      observedPlayer = p;
    }
  }, 1000);

  // Zpřístupnění diagnostiky do konzole stránky (Firefox: exportFunction).
  try {
    if (typeof exportFunction === 'function' && window.wrappedJSObject) {
      exportFunction(() => cloneInto(diagnose(), window), window, { defineAs: 'ytasDiagnose' });
    }
  } catch (e) { /* ignore */ }

  // Pro testy mimo prohlížeč
  self.__ytAdSkipper = { tick, diagnose, get inAd() { return inAd; } };
})();
