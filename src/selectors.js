/*
 * YT Ad Skipper – selektory přehrávače YouTube
 *
 * TOHLE JE SOUBOR, KTERÝ SE MĚNÍ, KDYŽ YOUTUBE ZMĚNÍ HTML.
 * Postup je popsaný v CLAUDE.md, v části „Aktualizace selektorů“.
 *
 * Pravidla:
 *  - Nové selektory přidávej na ZAČÁTEK seznamu, staré nemaž hned (YouTube
 *    zavádí změny postupně a různým uživatelům ukazuje různé verze).
 *  - Selektor má mířit na klikací prvek (<button>), ne na jeho obal.
 *  - Po úpravě zvyš "version" v manifest.json.
 *
 * Načítá se před content.js (pořadí v manifest.json → content_scripts.js).
 */
self.YTAS_SELECTORS = {
  // Element přehrávače; během reklamy má jednu z tříd v AD_CLASSES.
  PLAYER: [
    '#movie_player.html5-video-player',
    '.html5-video-player'
  ],

  // Třídy na přehrávači, které znamenají „právě běží reklama“.
  AD_CLASSES: [
    'ad-showing',
    'ad-interrupting'
  ],

  // <video> uvnitř přehrávače.
  VIDEO: [
    'video.html5-main-video',
    'video'
  ],

  // Tlačítko „Přeskočit“ / „Skip“.
  SKIP_BUTTON: [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container button',
    'button[id^="skip-button"]',
    '.videoAdUiSkipButton'
  ],

  // Křížek na zavření překryvné (bannerové) reklamy přes video.
  OVERLAY_CLOSE: [
    '.ytp-ad-overlay-close-button',
    '.ytp-ad-overlay-close-container button'
  ]
};
