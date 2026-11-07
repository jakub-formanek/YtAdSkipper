/*
 * Test logiky content scriptu na simulovaném přehrávači YouTube (jsdom).
 * Spuštění: npm test
 *
 * Fixture níže napodobuje HTML přehrávače. Když YouTube změní strukturu
 * a ty upravíš selectors.js, přidej sem i nový tvar HTML (viz CLAUDE.md).
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');
const selectorsSrc = fs.readFileSync(path.join(SRC, 'selectors.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(SRC, 'content.js'), 'utf8');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// Vytvoří prostředí s přehrávačem; skipButtonHtml = HTML tlačítka „Přeskočit“.
function setup({ skipButtonHtml = '<button class="ytp-skip-ad-button">Přeskočit</button>' } = {}) {
  const dom = new JSDOM(
    `<div id="movie_player" class="html5-video-player">
       <video class="html5-main-video"></video>
       <div class="ytp-ad-module"></div>
     </div>`,
    { runScripts: 'outside-only', pretendToBeVisual: true }
  );
  const w = dom.window;
  // jsdom nemá layout ani přehrávání médií – doplníme minimum
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
  const v = w.document.querySelector('video');
  const st = { rate: 1, muted: false, ct: 0, dur: 15 };
  Object.defineProperty(v, 'playbackRate', { get: () => st.rate, set: (x) => { st.rate = x; } });
  Object.defineProperty(v, 'muted', { get: () => st.muted, set: (x) => { st.muted = x; } });
  Object.defineProperty(v, 'currentTime', { get: () => st.ct, set: (x) => { st.ct = x; } });
  Object.defineProperty(v, 'duration', { get: () => st.dur });
  Object.defineProperty(v, 'paused', { get: () => false });

  const store = {};
  w.browser = {
    storage: {
      local: {
        get: (d) => Promise.resolve({ ...d, ...store }),
        set: (o) => { Object.assign(store, o); return Promise.resolve(); }
      },
      onChanged: { addListener() {} }
    }
  };
  w.eval(selectorsSrc);
  w.eval(contentSrc);

  const player = w.document.getElementById('movie_player');
  let clicks = 0;
  function addSkip() {
    player.querySelector('.ytp-ad-module').innerHTML = skipButtonHtml;
    player.querySelector('.ytp-ad-module').firstElementChild.addEventListener('click', () => clicks++);
  }
  return {
    w, st, store, player,
    s: w.__ytAdSkipper,
    addSkip,
    removeSkip: () => { player.querySelector('.ytp-ad-module').innerHTML = ''; },
    clicks: () => clicks,
    adOn: () => player.classList.add('ad-showing'),
    adOff: () => player.classList.remove('ad-showing'),
    close: () => w.close()
  };
}

console.log('content.js');

check('bez reklamy se nic nemění', () => {
  const t = setup();
  t.s.tick();
  assert.strictEqual(t.st.rate, 1);
  assert.strictEqual(t.st.muted, false);
  t.close();
});

check('krátká reklama: ztlumit, 16×, přetočit na konec, kliknout na Přeskočit, pak obnovit', () => {
  const t = setup();
  t.addSkip(); t.adOn(); t.s.tick();
  assert.strictEqual(t.st.muted, true);
  assert.strictEqual(t.st.rate, 16);
  assert.ok(Math.abs(t.st.ct - 14.9) < 0.01, 'currentTime=' + t.st.ct);
  assert.strictEqual(t.clicks(), 1);
  t.removeSkip(); t.adOff(); t.s.tick();
  assert.strictEqual(t.st.rate, 1);
  assert.strictEqual(t.st.muted, false);
  t.close();
});

check('dlouhý stream (SSAI): jen zrychlit, nepřetáčet', () => {
  const t = setup();
  t.st.dur = 1800; t.adOn(); t.s.tick();
  assert.strictEqual(t.st.rate, 16);
  assert.strictEqual(t.st.ct, 0);
  t.close();
});

check('zachová uživatelovo ztlumení a rychlost 1,5×', () => {
  const t = setup();
  t.st.muted = true; t.st.rate = 1.5;
  t.adOn(); t.s.tick(); t.adOff(); t.s.tick();
  assert.strictEqual(t.st.rate, 1.5);
  assert.strictEqual(t.st.muted, true);
  t.close();
});

// Každý selektor tlačítka ze selectors.js musí v testu opravdu kliknout.
const selectorFixtures = {
  '.ytp-skip-ad-button': '<button class="ytp-skip-ad-button">Přeskočit</button>',
  '.ytp-ad-skip-button': '<button class="ytp-ad-skip-button">Skip</button>',
  '.ytp-ad-skip-button-modern': '<button class="ytp-ad-skip-button-modern">Skip</button>',
  '.ytp-ad-skip-button-slot button': '<span class="ytp-ad-skip-button-slot"><button>Skip</button></span>',
  '.ytp-ad-skip-button-container button': '<div class="ytp-ad-skip-button-container"><button>Skip</button></div>',
  'button[id^="skip-button"]': '<button id="skip-button:6">Skip</button>',
  '.videoAdUiSkipButton': '<button class="videoAdUiSkipButton">Skip</button>'
};
for (const [sel, html] of Object.entries(selectorFixtures)) {
  check('selektor tlačítka funguje: ' + sel, () => {
    const t = setup({ skipButtonHtml: html });
    t.addSkip();
    let clicked = 0;
    t.player.querySelector(sel).addEventListener('click', () => clicked++);
    t.adOn(); t.s.tick();
    assert.strictEqual(clicked, 1);
    t.close();
  });
}

check('každý selektor v SKIP_BUTTON má fixture v testu', () => {
  const t = setup();
  const missing = [...t.w.YTAS_SELECTORS.SKIP_BUTTON].filter((s) => !(s in selectorFixtures));
  t.close();
  assert.deepStrictEqual(missing, [], 'doplň fixture pro: ' + missing.join(', '));
});

check('diagnose() najde kandidáta na tlačítko Přeskočit', () => {
  const t = setup({ skipButtonHtml: '<button class="nove-tlacitko-skip-2027">Přeskočit</button>' });
  t.addSkip(); t.adOn();
  const d = t.s.diagnose();
  assert.strictEqual(d.adShowing, true);
  assert.strictEqual(d.matchedSkipSelector, null);
  assert.strictEqual(d.skipCandidates.length, 1);
  assert.ok(d.skipCandidates[0].class.includes('nove-tlacitko-skip-2027'));
  t.close();
});

// Asynchronní test počítadla (flush po 1 s)
(async () => {
  const t = setup();
  t.adOn(); t.s.tick(); t.adOff(); t.s.tick();
  t.adOn(); t.s.tick(); t.adOff(); t.s.tick();
  await new Promise((r) => setTimeout(r, 1300));
  check('počítadlo = 2 po dvou reklamách', () => assert.strictEqual(t.store.skipped, 2));
  t.close();
  console.log(failures ? `\n${failures} test(ů) selhalo` : '\nvše v pořádku');
  process.exit(failures ? 1 : 0);
})();
