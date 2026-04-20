// SubMoa Comp Studio — /comp-studio
// Two-column layout: 280px accordion left rail + center canvas.
// Sections (top to bottom): File · Master Prompt · Viewport · Blocks · Draft · Export
// Blocks are the only section open by default. Clicking a block in the list
// or in the preview iframe auto-expands the block section and that row's
// inline edit accordion, collapsing any other open row.

import { useState, useEffect, useRef, useCallback } from 'react';
import { stripAndCleanWithStats, stripAndClean, PROMPT_WRAPPERS } from '../comp-utils';

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', w: 1280 },
  { id: 'tablet',  label: 'Tablet',  w: 768 },
  { id: 'mobile',  label: 'Mobile',  w: 390 },
];

// ─── Injected script — runs inside the preview iframe ────────────────────────
// Detects blocks, produces human-readable labels, handles click-to-edit with
// capture-phase listeners (so right-rail ad units are reachable), supports
// master-prompt full-HTML replacement, and serializes on demand.
const INJECTED_SCRIPT = `
(function() {
  // Capture-phase click so elements inside sticky/fixed/overflow:hidden sidebars
  // (right-rail ad units etc.) still broadcast upward to the parent.
  document.addEventListener('click', function(e) {
    var t = e.target;
    while (t && t !== document.body && t !== document.documentElement) {
      if (t.hasAttribute && t.hasAttribute('data-comp-id')) {
        parent.postMessage({ source: 'comp-studio', type: 'blockClick', id: t.getAttribute('data-comp-id') }, '*');
        break;
      }
      t = t.parentElement;
    }
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  function buildId(el, i) {
    var existing = el.getAttribute('data-comp-id');
    if (existing) return existing;
    var id = 'cs-' + i + '-' + Math.random().toString(36).slice(2, 7);
    el.setAttribute('data-comp-id', id);
    return id;
  }

  var IAB = [[728,90,'Leaderboard'],[300,250,'Medium Rectangle'],[160,600,'Wide Skyscraper'],[300,600,'Half Page'],[320,50,'Mobile Banner'],[970,90,'Billboard'],[300,50,'Mobile Banner Sm'],[320,100,'Large Mobile Banner'],[970,250,'Billboard Tall'],[300,1050,'Portrait']];
  function matchIab(w, h) {
    for (var i = 0; i < IAB.length; i++) {
      if (Math.abs(w - IAB[i][0]) <= 30 && Math.abs(h - IAB[i][1]) <= 30) {
        return { size: IAB[i][0] + 'x' + IAB[i][1], label: IAB[i][2] };
      }
    }
    return null;
  }

  var EXCLUDE = /mobile-menu|mobile-nav|footer-nav|sidebar-nav/i;
  function classStr(el) {
    var c = el.className;
    if (!c) return '';
    if (typeof c === 'string') return c;
    if (typeof c.baseVal === 'string') return c.baseVal;
    return '';
  }
  function isExcludedChrome(el) {
    var cur = el;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      var id = cur.id || '';
      var cls = classStr(cur);
      if (EXCLUDE.test(id) || EXCLUDE.test(cls)) return true;
      cur = cur.parentElement;
    }
    return false;
  }
  function hasAdHint(el) {
    var id = (el.id || '').toLowerCase();
    var cls = classStr(el).toLowerCase();
    return /\\b(ads?|adunit|ad-unit|advertisement|banner)\\b/.test(id) ||
           /\\b(ads?|adunit|ad-unit|advertisement|banner)\\b/.test(cls);
  }

  // Detect card-grid parents so anchor tags inside repeating card structures
  // don't get classified as isolated CTAs.
  function isInCardGrid(el) {
    var p = el.parentElement;
    var steps = 0;
    while (p && steps < 4) {
      // look for a parent whose siblings share the same tag and structure count
      var siblings = p.parentElement ? Array.prototype.slice.call(p.parentElement.children) : [];
      var sameTag = siblings.filter(function(s) { return s.tagName === p.tagName; });
      if (sameTag.length >= 2 && p.querySelector('h1,h2,h3,h4,h5')) return p;
      p = p.parentElement;
      steps++;
    }
    return null;
  }

  function truncateWords(str, n) {
    if (!str) return '';
    var words = str.trim().split(/\\s+/);
    return words.slice(0, n).join(' ') + (words.length > n ? '…' : '');
  }

  function friendlyName(el, type, attrs) {
    var tag = el.tagName.toUpperCase();
    var text = (el.innerText || el.textContent || '').trim();
    if (type === 'logo') {
      var lw = el.naturalWidth || el.width || el.offsetWidth || 0;
      var lh = el.naturalHeight || el.height || el.offsetHeight || 0;
      return 'Site Logo — ' + lw + '×' + lh;
    }
    if (tag === 'HEADER') return 'Site Header';
    if (tag === 'FOOTER') return 'Site Footer';
    if (tag === 'NAV') {
      var links = el.querySelectorAll('a').length;
      return 'Site Navigation — ' + links + ' link' + (links === 1 ? '' : 's');
    }
    if (/^H[1-6]$/.test(tag)) return truncateWords(text, 6) || ('H' + tag.slice(1) + ' heading');
    if (tag === 'P') return truncateWords(text, 6) || 'Paragraph';
    if (tag === 'IMG') {
      var w = el.naturalWidth || el.width || el.offsetWidth || 0;
      var h = el.naturalHeight || el.height || el.offsetHeight || 0;
      // When the img has no identifying attributes (no class, no id, no
      // data-*), climb up to 3 levels looking for the closest ancestor with
      // a class or id we can borrow for a human-readable label.
      var hasAttrs = (el.id && el.id.length) ||
        (typeof el.className === 'string' && el.className.trim().length) ||
        (el.dataset && Object.keys(el.dataset || {}).length > 0);
      if (!hasAttrs) {
        var p = el.parentElement;
        var steps = 0;
        while (p && steps < 3 && p !== document.body && p !== document.documentElement) {
          var pid = p.id || '';
          var pcls = classStr(p) || '';
          if (pid || pcls) {
            var hint = pid ? ('#' + pid) : ('.' + pcls.trim().split(/\\s+/)[0]);
            var shortHint = hint.slice(0, 40);
            // Use a human label that depends on the ancestor's role hint.
            if (/card|tile|thumb/i.test(hint)) return 'Card image — ' + shortHint;
            if (/article|post|story/i.test(hint)) return 'Article thumbnail — ' + shortHint;
            if (/hero|banner|masthead/i.test(hint)) return 'Hero image — ' + shortHint;
            return 'Image in ' + shortHint + ' (' + w + '×' + h + ')';
          }
          p = p.parentElement;
          steps++;
        }
        return 'Inline image — ' + w + '×' + h;
      }
      return 'Image — ' + w + '×' + h;
    }
    if (type === 'video') {
      var vSrc = (el.getAttribute('src') || '').toString();
      var vLabel = 'Video';
      if (/youtube|youtu\\.be/i.test(vSrc)) vLabel = 'YouTube video';
      else if (/vimeo/i.test(vSrc)) vLabel = 'Vimeo video';
      else if (/wistia/i.test(vSrc)) vLabel = 'Wistia video';
      else if (tag === 'VIDEO') vLabel = 'HTML5 video';
      var vw = el.offsetWidth || el.width || 0;
      var vh = el.offsetHeight || el.height || 0;
      return vLabel + (vw && vh ? ' — ' + vw + '×' + vh : '');
    }
    if (type === 'ad' && attrs) return 'Ad Unit — ' + attrs.adLabel + ' ' + attrs.adSize;
    if (type === 'card') {
      var h = el.querySelector('h1,h2,h3,h4,h5');
      return 'Article Card — ' + (h ? truncateWords((h.innerText || h.textContent || '').trim(), 8) : truncateWords(text, 8));
    }
    if (tag === 'SECTION' || tag === 'ARTICLE') {
      var inside = el.querySelector('h1,h2,h3');
      if (inside) return truncateWords((inside.innerText || inside.textContent || '').trim(), 8);
      return tag === 'SECTION' ? 'Section' : 'Article';
    }
    if (tag === 'A') return truncateWords(text, 6) || 'Link';
    return truncateWords(text, 8) || tag.toLowerCase();
  }

  function eyebrow(type) {
    if (type === 'header')       return 'HEADER';
    if (type === 'nav')          return 'NAVIGATION';
    if (type === 'heading')      return 'HEADING';
    if (type === 'paragraph')    return 'PARAGRAPH';
    if (type === 'image')        return 'IMAGE';
    if (type === 'logo')         return 'LOGO';
    if (type === 'ad')           return 'AD UNIT';
    if (type === 'section')      return 'SECTION';
    if (type === 'card')         return 'CARD';
    if (type === 'footer')       return 'FOOTER';
    if (type === 'cta')          return 'CTA';
    if (type === 'video')        return 'VIDEO';
    return 'BLOCK';
  }

  var CTA_RE = /^(shop now|learn more|subscribe|read more|get started|sign up|buy now|order|download|view more|click here|contact|request|try)\\b/i;

  function collect() {
    var candidates = new Map();
    var attrs = new Map();
    var cardParents = new Set();

    // Pre-pass — swap every video iframe / lazy shell for a neutral
    // placeholder BEFORE any other detection runs. This keeps the real
    // iframe from being buried by a parent card/article/ad candidate
    // during dedup, and it guarantees the user never sees the live
    // YouTube embed in the canvas. The placeholder img survives
    // subsequent detectors via the img[data-comp-video-placeholder]
    // match on line ~310.
    (function prePassVideoSwap() {
      var PRE_VIDEO_HOST_RE = /(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|vimeo\\.com|player\\.vimeo|wistia\\.(?:com|net)|fast\\.wistia|ytimg\\.com|googlevideo\\.com|embedly)/i;
      var swapCount = 0;
      var iframeInventory = [];
      function slotSvg(w, h) {
        return 'data:image/svg+xml,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
          '<rect width="' + w + '" height="' + h + '" fill="#FAF7F2"/>' +
          '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="none" stroke="#B8872E" stroke-width="2" stroke-dasharray="10 6"/>' +
          '<circle cx="' + (w / 2) + '" cy="' + (h / 2 - 14) + '" r="28" fill="none" stroke="#2B4030" stroke-width="2.5"/>' +
          '<polygon points="' + (w / 2 - 10) + ',' + (h / 2 - 28) + ' ' + (w / 2 - 10) + ',' + (h / 2) + ' ' + (w / 2 + 14) + ',' + (h / 2 - 14) + '" fill="#2B4030"/>' +
          '<text x="' + (w / 2) + '" y="' + (h / 2 + 28) + '" text-anchor="middle" fill="#2B4030" font-family="sans-serif" font-size="14" font-weight="600">VIDEO SLOT — ' + w + ' × ' + h + '</text>' +
          '<text x="' + (w / 2) + '" y="' + (h / 2 + 50) + '" text-anchor="middle" fill="#6B5744" font-family="sans-serif" font-size="12">Click to upload replacement image</text>' +
          '</svg>'
        );
      }
      function buildPlaceholder(el, src) {
        var w = el.offsetWidth || parseInt(el.getAttribute('width') || '0', 10) || 0;
        var h = el.offsetHeight || parseInt(el.getAttribute('height') || '0', 10) || 0;
        if (!w || !h) {
          var anc = el.parentElement, steps = 0;
          while (anc && steps < 4 && (!w || !h)) {
            if (!w) w = anc.offsetWidth || 0;
            if (!h && w) h = Math.round(w * 9 / 16);
            anc = anc.parentElement; steps++;
          }
        }
        if (!w) w = 640;
        if (!h) h = Math.round(w * 9 / 16);
        var img = document.createElement('img');
        img.setAttribute('src', slotSvg(w, h));
        img.setAttribute('data-comp-video-placeholder', '1');
        img.setAttribute('data-comp-video-src', src || '');
        img.setAttribute('data-comp-original-html', encodeURIComponent(el.outerHTML));
        img.style.display = 'block';
        img.style.cursor = 'pointer';
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.maxWidth = '100%';
        // Carry over a data-comp-id if the element already had one (stable
        // selection across collect() runs).
        var existingId = el.getAttribute && el.getAttribute('data-comp-id');
        if (existingId) img.setAttribute('data-comp-id', existingId);
        return img;
      }
      // Direct video iframes — check src, data-src, srcdoc (SingleFile often
      // inlines YouTube as srcdoc), and a handful of ancestor/class hints.
      Array.prototype.slice.call(document.querySelectorAll('iframe')).forEach(function(el) {
        if (!el.parentNode) return;
        if (el.closest && el.closest('[data-comp-skip]')) return;
        var rawSrc = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || '';
        var srcdoc = el.getAttribute('srcdoc') || '';
        var title  = (el.getAttribute('title') || '').toLowerCase();
        var cls    = (typeof el.className === 'string' ? el.className : '').toLowerCase();
        var anyHint = PRE_VIDEO_HOST_RE.test(rawSrc)
                   || PRE_VIDEO_HOST_RE.test(srcdoc)
                   || /youtube|vimeo|wistia|video|player/i.test(title)
                   || /youtube|vimeo|wistia|video|player/i.test(cls);
        iframeInventory.push({ src: rawSrc.slice(0, 120), hasSrcdoc: !!srcdoc, title: title.slice(0, 60), cls: cls.slice(0, 80), matched: anyHint });
        if (!anyHint) return;
        el.parentNode.replaceChild(buildPlaceholder(el, rawSrc || ('youtube-embed:' + title)), el);
        swapCount++;
      });
      // <video> elements — keep as-is (they don't cross-origin-block) but
      // still wrap behind an editable placeholder so the user can upload a
      // poster instead. Skipping the swap for now keeps HTML5 videos intact.
      // Lazy-load shells — lite-youtube, youtube-player divs, elements with
      // data-youtube-id / data-video-id. Scripts that would normally inject
      // the iframe have been stripped on import, so we synthesize an iframe
      // src and swap in a placeholder.
      Array.prototype.slice.call(document.querySelectorAll(
        'lite-youtube, [class*="lite-youtube" i], [class*="youtube-player" i], [class*="yt-lite" i], ' +
        '[data-youtube-id], [data-video-id], [data-yt-id], [data-ytid], ' +
        '[data-src*="youtube" i], [data-src*="youtu.be" i], [data-src*="vimeo" i]'
      )).forEach(function(el) {
        if (!el.parentNode) return;
        if (el.closest && el.closest('[data-comp-skip]')) return;
        var ytId = el.getAttribute('data-youtube-id')
                || el.getAttribute('data-video-id')
                || el.getAttribute('data-yt-id')
                || el.getAttribute('data-ytid') || '';
        var dsrc = el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-url') || '';
        if (!ytId && dsrc) {
          var m0 = dsrc.match(/(?:youtube(?:-nocookie)?\\.com\\/embed\\/|youtu\\.be\\/|youtube\\.com\\/watch\\?v=)([A-Za-z0-9_-]{8,})/i);
          if (m0) ytId = m0[1];
        }
        var synthSrc = ytId ? ('https://www.youtube.com/embed/' + ytId) : dsrc;
        if (!synthSrc) return;
        el.parentNode.replaceChild(buildPlaceholder(el, synthSrc), el);
        swapCount++;
      });
      // Generic video-thumb shells — a div/a/button with a class hint and a
      // background-image or child poster img that's in a 16:9-ish aspect.
      // Catches sites that render a "click to play" tile that later injects
      // an iframe via JS (those scripts are stripped on import).
      Array.prototype.slice.call(document.querySelectorAll(
        '[class*="video" i], [class*="player" i], [class*="embed" i], ' +
        '[data-comp-skip]:not(*)' // harmless no-op guard so the selector list is never empty
      )).forEach(function(el) {
        if (!el.parentNode) return;
        if (el.closest && el.closest('[data-comp-skip]')) return;
        if (el.tagName === 'IFRAME' || el.tagName === 'VIDEO') return; // handled above
        // Must be sized like a video.
        var w = el.offsetWidth || 0;
        var h = el.offsetHeight || 0;
        if (w < 300 || h < 160) return;
        var aspect = w / h;
        if (aspect < 1.3 || aspect > 2.2) return;
        // Must *look* like a video — has a play-button descendant or a
        // background-image with recognizable keywords.
        var hasPlayHint = !!el.querySelector('[class*="play" i], svg[class*="play" i], [aria-label*="play" i]');
        var bg = '';
        try { bg = (window.getComputedStyle(el).backgroundImage || '').toLowerCase(); } catch (_) {}
        var bgHint = /youtube|ytimg|vimeo|player|embed/.test(bg);
        if (!hasPlayHint && !bgHint) return;
        var ytHrefAttr = el.getAttribute('data-yt-href') || el.getAttribute('data-video-url') || '';
        el.parentNode.replaceChild(buildPlaceholder(el, ytHrefAttr || ('video-thumb:' + (el.className || ''))), el);
        swapCount++;
      });
      // One-shot diagnostic: parent window gets a summary it can surface via
      // console. Helps narrow down "still showing the real player" reports.
      try {
        parent.postMessage({
          source: 'comp-studio',
          type: 'debug',
          note: 'pre-pass video swap: swapped=' + swapCount + ' iframes=' + iframeInventory.length,
          inventory: iframeInventory,
        }, '*');
      } catch (_) {}
    })();

    // Logo detection — handles three shapes:
    //   A) a real <img> (prefer logo/brand class/src hints, fall through to any img)
    //   B) a CSS background-image on a logo-classed/ided element — check both
    //      the element itself and its ::before pseudo so templates that paint
    //      the mark via a pseudo layer still register.
    // Whichever logo we find gets added to cardParents so the later <header>
    // block registration doesn't dedup-drop it.
    var firstHeader = document.querySelector('header');
    if (firstHeader && !isExcludedChrome(firstHeader)) {
      var logoImg = firstHeader.querySelector(
        'img[class*="logo" i], img[class*="brand" i], img[src*="logo" i], img[src*="brand" i]'
      ) || firstHeader.querySelector('img');
      if (logoImg && !candidates.has(logoImg)) {
        candidates.set(logoImg, { type: 'logo' });
        cardParents.add(logoImg);
      } else if (!logoImg) {
        var logoHints = firstHeader.querySelectorAll(
          '[class*="logo" i], [class*="brand" i], [id*="logo" i], [id*="brand" i]'
        );
        for (var li = 0; li < logoHints.length; li++) {
          var hel = logoHints[li];
          if (candidates.has(hel)) continue;
          var csMain = null, csBefore = null;
          try { csMain = window.getComputedStyle(hel); } catch (_) {}
          try { csBefore = window.getComputedStyle(hel, '::before'); } catch (_) {}
          var bgPick = '', bgIsBefore = false;
          if (csMain && csMain.backgroundImage && csMain.backgroundImage !== 'none') {
            bgPick = csMain.backgroundImage;
          } else if (csBefore && csBefore.backgroundImage && csBefore.backgroundImage !== 'none') {
            bgPick = csBefore.backgroundImage;
            bgIsBefore = true;
          }
          if (!bgPick) continue;
          var mUrl = bgPick.match(/url\\(["']?([^"')]+)["']?\\)/);
          if (!mUrl) continue;
          candidates.set(hel, { type: 'logo', isCssBg: true, cssUrl: mUrl[1], bgIsBefore: bgIsBefore });
          cardParents.add(hel);
          break;
        }
      }
    }

    // Register the first <header> and <footer> as their own blocks so the
    // user can swap them out with an uploaded screenshot. Logo candidates
    // above were added to cardParents so they still survive dedup.
    if (firstHeader && !isExcludedChrome(firstHeader) && !candidates.has(firstHeader)) {
      candidates.set(firstHeader, { type: 'header' });
    }
    var firstFooter = document.querySelector('footer');
    if (firstFooter && !isExcludedChrome(firstFooter) && !candidates.has(firstFooter)) {
      candidates.set(firstFooter, { type: 'footer' });
    }

    // Ad placeholders — check rendered dimensions against IAB
    document.querySelectorAll('.ad-placeholder').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      var m = matchIab(el.offsetWidth, el.offsetHeight);
      if (m) { attrs.set(el, { adSize: m.size, adLabel: m.label }); candidates.set(el, { type: 'ad' }); }
    });
    // Aggressive ad-unit sweep — include aside, sidebar, rail, sticky, fixed, overflow:hidden containers.
    document.querySelectorAll('aside, [class*="sidebar" i], [class*="rail" i], div, ins, section').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      if (!hasAdHint(el)) {
        // also catch position:sticky/fixed/overflow:hidden containers that hold an ad-sized child
        var cs = null; try { cs = window.getComputedStyle(el); } catch {}
        var suspicious = cs && (cs.position === 'sticky' || cs.position === 'fixed' || cs.overflow === 'hidden');
        if (!suspicious) return;
      }
      var m = matchIab(el.offsetWidth, el.offsetHeight);
      if (m) { attrs.set(el, { adSize: m.size, adLabel: m.label }); candidates.set(el, { type: 'ad' }); }
    });

    // Detect article card grids — if a container has >=2 sibling children each
    // containing a heading, treat each child as an Article Card block.
    document.querySelectorAll('div, section, ul, article').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      var children = Array.prototype.slice.call(el.children).filter(function(c) { return c.nodeType === 1; });
      if (children.length < 2) return;
      var structured = children.filter(function(c) { return c.querySelector('h1,h2,h3,h4') && c.querySelector('a'); });
      if (structured.length < 2) return;
      // match by shared tag (all same) or shared wrapping class
      var firstTag = structured[0].tagName;
      var matching = structured.filter(function(c) { return c.tagName === firstTag; });
      if (matching.length < 2) return;
      matching.forEach(function(card) { cardParents.add(card); candidates.set(card, { type: 'card' }); });
    });

    // Single-card detection — catch standalone article cards (image + heading
    // + body paragraph) even when they aren't part of a sibling grid. Skips
    // anything already marked as a grid card so detection is additive.
    document.querySelectorAll('article, [class*="card" i], [class*="story" i], [class*="tile" i], [class*="post-" i]').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      if (cardParents.has(el)) return;
      var cardHeadings = el.querySelectorAll('h1,h2,h3,h4,h5');
      if (cardHeadings.length === 0 || cardHeadings.length > 2) return;
      if (!el.querySelector('img')) return;
      if (!el.querySelector('p')) return;
      // Avoid matching ancestors that already contain a grid/single card.
      var innerCards = 0;
      cardParents.forEach(function(cp) { if (el.contains(cp) && cp !== el) innerCards++; });
      if (innerCards > 0) return;
      candidates.set(el, { type: 'card' });
      cardParents.add(el);
    });

    // Video placeholders — catches both the pre-pass swap (iframes / lazy
    // shells replaced at the top of collect()) and anything saved from a
    // prior session. Must run BEFORE the generic image detector so the img
    // isn't classified as a plain image block. Added to cardParents so an
    // enclosing article/card doesn't dedup-drop it.
    document.querySelectorAll('img[data-comp-video-placeholder]').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      candidates.set(el, { type: 'video', videoPlaceholder: true });
      cardParents.add(el);
    });

    // Video embeds — match any iframe or lazy-embed element pointing at
    // YouTube/Vimeo/Wistia, or a plain <video>. Loosened from strict
    // "/embed/" path matching to cover SingleFile captures where the
    // lazy-load script has been stripped and only a thumbnail shell
    // remains, plus watch-style URLs and data-src lazy attributes.
    var VIDEO_HOST_RE = /(youtube\\.com|youtu\\.be|youtube-nocookie\\.com|vimeo\\.com|wistia\\.(?:com|net)|fast\\.wistia)/i;
    function getVideoSrcFromAttrs(el) {
      var raw = el.getAttribute('src')
        || el.getAttribute('data-src')
        || el.getAttribute('data-lazy-src')
        || el.getAttribute('data-url')
        || el.getAttribute('data-embed-url')
        || '';
      return String(raw);
    }
    document.querySelectorAll('iframe').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      var src = getVideoSrcFromAttrs(el).toLowerCase();
      if (!src || !VIDEO_HOST_RE.test(src)) return;
      candidates.set(el, { type: 'video', videoSrc: src });
    });
    // Lazy-load "shell" elements — common on SingleFile captures where the
    // real iframe is never injected. Match lite-youtube web components,
    // youtube-player divs, and any element carrying a data-youtube-id /
    // data-video-id / data-yt-id marker.
    document.querySelectorAll(
      'lite-youtube, [class*="lite-youtube" i], [class*="youtube-player" i], [class*="yt-lite" i], ' +
      '[data-youtube-id], [data-video-id], [data-yt-id], [data-ytid], [data-src*="youtube" i], [data-src*="youtu.be" i]'
    ).forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      var ytId = el.getAttribute('data-youtube-id')
              || el.getAttribute('data-video-id')
              || el.getAttribute('data-yt-id')
              || el.getAttribute('data-ytid')
              || '';
      var dsrc = getVideoSrcFromAttrs(el);
      if (!ytId && dsrc) {
        var m0 = dsrc.match(/(?:youtube(?:-nocookie)?\\.com\\/embed\\/|youtu\\.be\\/|youtube\\.com\\/watch\\?v=)([A-Za-z0-9_-]{8,})/i);
        if (m0) ytId = m0[1];
      }
      var synthSrc = ytId ? ('https://www.youtube.com/embed/' + ytId) : dsrc;
      if (!synthSrc) return;
      candidates.set(el, { type: 'video', videoSrc: synthSrc, isLazyShell: true });
    });
    document.querySelectorAll('video').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      candidates.set(el, { type: 'video' });
    });

    // Images (>80x80)
    document.querySelectorAll('img').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      var w = el.naturalWidth || el.width || el.offsetWidth || 0;
      var h = el.naturalHeight || el.height || el.offsetHeight || 0;
      if (w > 80 && h > 80) candidates.set(el, { type: 'image' });
    });

    // CSS-variable backgrounds (SingleFile pattern: --sf-img-N). SingleFile
    // rewrites <img> and url() references into CSS custom properties declared
    // at the document root. Find the defined vars, then scan elements whose
    // computed background-image references one of them.
    try {
      var sfVars = {};
      // Walk the document's stylesheets for --sf-img-N declarations.
      for (var si = 0; si < document.styleSheets.length; si++) {
        var sheet;
        try { sheet = document.styleSheets[si]; } catch (_) { continue; }
        var rules = [];
        try { rules = sheet.cssRules || sheet.rules || []; } catch (_) { continue; }
        for (var ri = 0; ri < rules.length; ri++) {
          var rule = rules[ri];
          if (!rule || !rule.style) continue;
          for (var ci = 0; ci < rule.style.length; ci++) {
            var name = rule.style[ci];
            if (/^--sf-img-\\d+$/.test(name)) {
              var val = rule.style.getPropertyValue(name).trim();
              if (val) sfVars[name] = val;
            }
          }
        }
      }
      // Also sweep inline style="--sf-img-N: ..." declarations on any element.
      document.querySelectorAll('[style*="--sf-img-"]').forEach(function(el) {
        var s = el.getAttribute('style') || '';
        var re = /(--sf-img-\\d+)\\s*:\\s*([^;]+)/g;
        var m;
        while ((m = re.exec(s))) { sfVars[m[1]] = m[2].trim(); }
      });

      if (Object.keys(sfVars).length > 0) {
        document.querySelectorAll('*').forEach(function(el) {
          if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
          if (candidates.has(el)) return;
          var bg = '';
          try { bg = window.getComputedStyle(el).backgroundImage || ''; } catch (_) { return; }
          if (!bg || bg === 'none') return;
          // Only consider elements that actually reference one of the sf vars.
          var varMatch = bg.match(/var\\((--sf-img-\\d+)\\)/);
          if (!varMatch) return;
          var w = el.offsetWidth || 0;
          var h = el.offsetHeight || 0;
          if (w < 80 || h < 80) return;
          candidates.set(el, { type: 'image', cssVarImage: true, cssVarName: varMatch[1] });
        });
      }
    } catch (cssErr) {
      // Non-fatal — just log and continue with the rest of collect().
      parent.postMessage({ source: 'comp-studio', type: 'debug', note: 'sf-img scan failed: ' + (cssErr && cssErr.message || cssErr) }, '*');
    }

    // Headings + paragraphs
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      candidates.set(el, { type: 'heading' });
    });
    document.querySelectorAll('p').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      var text = (el.innerText || el.textContent || '').trim();
      if (text.length < 25) return;
      if (el.offsetHeight < 24) return;
      candidates.set(el, { type: 'paragraph' });
    });

    // Standalone CTAs only — require action phrase AND not inside a card grid AND not in nav
    document.querySelectorAll('a').forEach(function(el) {
      if (el.closest('[data-comp-skip]') || isExcludedChrome(el)) return;
      if (candidates.has(el)) return;
      if (el.closest('nav, header, footer, ul, ol')) return;
      if (el.closest('[data-comp-skip]')) return;
      var text = (el.innerText || el.textContent || '').trim();
      if (!CTA_RE.test(text)) return;
      if (isInCardGrid(el)) return;
      if (text.length < 3 || text.length > 60) return;
      candidates.set(el, { type: 'cta' });
    });

    // Dedup: drop candidates whose ancestor is also a candidate
    var final = [];
    candidates.forEach(function(info, el) {
      var p = el.parentElement, skip = false;
      while (p && p !== document.body && p !== document.documentElement) {
        if (candidates.has(p) && !cardParents.has(el)) { skip = true; break; }
        p = p.parentElement;
      }
      if (!skip) final.push({ el: el, info: info });
    });

    // Preserve DOM order and cap
    final.sort(function(a, b) {
      if (a.el === b.el) return 0;
      var pos = a.el.compareDocumentPosition(b.el);
      return (pos & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    final = final.slice(0, 60);

    var blocks = [];
    var i = 0;
    final.forEach(function(c) {
      var id = buildId(c.el, i++);
      var type = c.info.type;
      var a = attrs.get(c.el) || null;
      var name = friendlyName(c.el, type, a);
      var preview = (c.el.innerText || c.el.textContent || '').trim().slice(0, 140);
      var block = {
        id: id,
        type: type,
        name: name,
        eyebrow: eyebrow(type),
        preview: preview,
      };
      if (type === 'ad' && a) { block.adSize = a.adSize; block.adLabel = a.adLabel; }
      if (type === 'card') {
        var cImg = c.el.querySelector('img');
        var cH = c.el.querySelector('h1,h2,h3,h4,h5');
        var cP = c.el.querySelector('p');
        var cBtn = c.el.querySelector('a.btn, button, .cta, [class*="button"], a[class*="btn"], a[class*="cta"]');
        if (!cBtn) cBtn = c.el.querySelector('a');
        block.cardFields = {
          imageUrl:   cImg ? (cImg.getAttribute('src') || '') : '',
          headline:   cH   ? (cH.innerText || cH.textContent || '').trim() : '',
          body:       cP   ? (cP.innerText || cP.textContent || '').trim() : '',
          buttonText: cBtn ? (cBtn.innerText || cBtn.textContent || '').trim() : '',
          buttonUrl:  (cBtn && cBtn.getAttribute) ? (cBtn.getAttribute('href') || '') : '',
        };
      }
      if (type === 'logo') {
        if (c.info.isCssBg) {
          block.imgW = c.el.offsetWidth || 0;
          block.imgH = c.el.offsetHeight || 0;
          block.currentSrc = c.info.cssUrl || '';
          block.isCssBg = true;
          block.bgIsBefore = !!c.info.bgIsBefore;
        } else {
          block.imgW = c.el.naturalWidth || c.el.width || c.el.offsetWidth || 0;
          block.imgH = c.el.naturalHeight || c.el.height || c.el.offsetHeight || 0;
          block.currentSrc = c.el.getAttribute('src') || '';
          block.isCssBg = false;
        }
      }
      if (type === 'video') {
        if (c.info.videoPlaceholder || c.el.getAttribute('data-comp-video-placeholder') === '1') {
          block.videoTag = 'IFRAME';
          block.videoSrc = c.el.getAttribute('data-comp-video-src') || '';
          block.videoPlaceholder = true;
        } else {
          block.videoTag = c.el.tagName.toUpperCase();
          block.videoSrc = c.el.getAttribute('src') || '';
          block.videoPlaceholder = false;
        }
        block.videoW = c.el.offsetWidth || c.el.width || 0;
        block.videoH = c.el.offsetHeight || c.el.height || 0;
      }
      if (type === 'image') {
        // <img> dimensions come from natural/width/offset; CSS-var backgrounds
        // live on arbitrary elements so we fall back to offsetWidth/offsetHeight.
        block.imgW = c.el.naturalWidth || c.el.width || c.el.offsetWidth || 0;
        block.imgH = c.el.naturalHeight || c.el.height || c.el.offsetHeight || 0;
        block.currentSrc = c.el.getAttribute('src') || '';
        if (c.info.cssVarImage) {
          block.cssVarImage = true;
          block.cssVarName = c.info.cssVarName || null;
          block.name = 'CSS-var image — ' + (c.info.cssVarName || 'background') + ' (' + block.imgW + '×' + block.imgH + ')';
        }
      }
      if (c.el.getAttribute('data-comp-locked') === '1') block.locked = true;
      blocks.push(block);
    });

    // Every video candidate (iframe, lazy shell, <video>) is swapped for a
    // neutral image-upload slot at the captured dimensions. Intentionally
    // NOT a YouTube thumbnail — the user wants an empty placeholder they
    // can fill with their own image. The original markup is kept in
    // data-comp-original-html for serialize() restoration if needed later.
    function buildVideoSlotSvg(w, h) {
      var label = w + ' × ' + h;
      return 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
        '<rect width="' + w + '" height="' + h + '" fill="#FAF7F2"/>' +
        '<rect x="1" y="1" width="' + (w - 2) + '" height="' + (h - 2) + '" fill="none" stroke="#B8872E" stroke-width="2" stroke-dasharray="10 6"/>' +
        '<circle cx="' + (w / 2) + '" cy="' + (h / 2 - 14) + '" r="28" fill="none" stroke="#2B4030" stroke-width="2.5"/>' +
        '<polygon points="' + (w / 2 - 10) + ',' + (h / 2 - 28) + ' ' + (w / 2 - 10) + ',' + (h / 2) + ' ' + (w / 2 + 14) + ',' + (h / 2 - 14) + '" fill="#2B4030"/>' +
        '<text x="' + (w / 2) + '" y="' + (h / 2 + 28) + '" text-anchor="middle" fill="#2B4030" font-family="sans-serif" font-size="14" font-weight="600">VIDEO SLOT — ' + label + '</text>' +
        '<text x="' + (w / 2) + '" y="' + (h / 2 + 50) + '" text-anchor="middle" fill="#6B5744" font-family="sans-serif" font-size="12">Click to upload replacement image</text>' +
        '</svg>'
      );
    }
    blocks.forEach(function(blk) {
      if (blk.type !== 'video' || blk.videoPlaceholder) return;
      var el = findById(blk.id);
      if (!el) return;
      // Dimensions: measured first, then width/height attrs, then the
      // offset of the nearest sized ancestor, finally a 640×360 default so
      // lazy shells with 0 measured size still render a visible tile.
      var w = el.offsetWidth || parseInt(el.getAttribute('width') || '0', 10) || 0;
      var h = el.offsetHeight || parseInt(el.getAttribute('height') || '0', 10) || 0;
      if (!w || !h) {
        var anc = el.parentElement, steps = 0;
        while (anc && steps < 4 && (!w || !h)) {
          if (!w) w = anc.offsetWidth || 0;
          if (!h && w) h = Math.round(w * 9 / 16);
          anc = anc.parentElement; steps++;
        }
      }
      if (!w) w = 640;
      if (!h) h = Math.round(w * 9 / 16);

      var src = blk.videoSrc || el.getAttribute('src')
              || el.getAttribute('data-src') || el.getAttribute('data-embed-url') || '';
      var slotSvg = buildVideoSlotSvg(w, h);
      var img = document.createElement('img');
      img.setAttribute('src', slotSvg);
      img.setAttribute('data-comp-id', blk.id);
      img.setAttribute('data-comp-video-placeholder', '1');
      img.setAttribute('data-comp-video-src', src);
      // Preserve the original markup for serialize(). Lazy shells have no
      // real iframe — synthesize one from the resolved src so exports still
      // round-trip to a working embed.
      var origHtml = el.outerHTML;
      if (el.tagName !== 'IFRAME' && el.tagName !== 'VIDEO') {
        origHtml = '<iframe src="' + (src || '') + '" width="' + w + '" height="' + h + '" frameborder="0" allowfullscreen></iframe>';
      }
      img.setAttribute('data-comp-original-html', encodeURIComponent(origHtml));
      img.style.display = 'block';
      img.style.cursor = 'pointer';
      img.style.width = w + 'px';
      img.style.height = h + 'px';
      img.style.maxWidth = '100%';
      blk.videoPlaceholder = true;
      blk.videoW = w;
      blk.videoH = h;
      if (el.parentNode) el.parentNode.replaceChild(img, el);
    });

    parent.postMessage({ source: 'comp-studio', type: 'blocks', blocks: blocks }, '*');
  }

  function findById(id) { return document.querySelector('[data-comp-id="' + id + '"]'); }

  // Walks a cloned DOM tree and replaces any img[data-comp-video-placeholder]
  // with the real iframe markup captured in data-comp-original-html. Keeps
  // the export fidelity intact while the canvas keeps showing thumbnails.
  function restoreVideoPlaceholders(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
    rootEl.querySelectorAll('img[data-comp-video-placeholder]').forEach(function(img) {
      var raw = img.getAttribute('data-comp-original-html') || '';
      if (!raw) return;
      try {
        var decoded = decodeURIComponent(raw);
        var tpl = document.createElement('template');
        tpl.innerHTML = decoded;
        var restored = tpl.content.firstElementChild;
        if (restored) img.replaceWith(restored);
      } catch (_) {}
    });
  }

  // Swap the source on an <img> without letting the browser load the old
  // CDN URL via srcset/sizes or a parent <picture><source srcset>. Preserves
  // the element's existing width/height so replaced images stay constrained
  // to the original layout slot.
  function swapImgSrc(imgEl, newUrl) {
    if (!imgEl || imgEl.tagName !== 'IMG') return;
    // Clear srcset on the img itself.
    imgEl.removeAttribute('srcset');
    imgEl.removeAttribute('sizes');
    // And on any <source srcset> siblings inside a parent <picture>.
    var picture = imgEl.parentElement && imgEl.parentElement.tagName === 'PICTURE'
      ? imgEl.parentElement
      : null;
    if (picture) {
      picture.querySelectorAll('source[srcset]').forEach(function(s) { s.remove(); });
    }
    // Measure the current layout slot BEFORE swapping src so the natural
    // dimensions of the new image don't bleed into layout.
    var ow = imgEl.offsetWidth || imgEl.width || 0;
    var oh = imgEl.offsetHeight || imgEl.height || 0;
    imgEl.setAttribute('src', newUrl);
    // Lock the rendered size to the original slot. 'width:100%' lets the img
    // still flex with parent containers while 'height' keeps aspect stable.
    if (ow && oh) {
      imgEl.style.width = '100%';
      imgEl.style.height = oh + 'px';
      if (!imgEl.style.objectFit) imgEl.style.objectFit = 'cover';
    }
  }

  function highlight(id) {
    document.querySelectorAll('[data-comp-hl]').forEach(function(el) {
      el.style.outline = el.getAttribute('data-comp-hl-prev') || '';
      el.removeAttribute('data-comp-hl');
      el.removeAttribute('data-comp-hl-prev');
    });
    if (!id) return;
    var el = findById(id);
    if (!el) return;
    el.setAttribute('data-comp-hl-prev', el.style.outline || '');
    el.setAttribute('data-comp-hl', '1');
    el.style.outline = '2px solid #B8872E';
    el.style.outlineOffset = '2px';
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function setLock(id, locked) {
    var el = findById(id);
    if (!el) return;
    if (locked) {
      el.setAttribute('data-comp-locked', '1');
      el.style.position = el.style.position || 'relative';
      el.style.boxShadow = 'inset 0 0 0 2px rgba(184,135,46,0.6)';
      // inject a subtle amber tint overlay once
      if (!el.querySelector('[data-comp-lock-overlay]')) {
        var ov = document.createElement('span');
        ov.setAttribute('data-comp-lock-overlay', '1');
        ov.setAttribute('data-comp-skip', '1');
        ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:rgba(184,135,46,0.10);z-index:1;';
        el.appendChild(ov);
        var badge = document.createElement('span');
        badge.setAttribute('data-comp-lock-badge', '1');
        badge.setAttribute('data-comp-skip', '1');
        badge.textContent = '🔒';
        badge.style.cssText = 'position:absolute;top:4px;right:4px;background:#B8872E;color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;z-index:2;pointer-events:none;';
        el.appendChild(badge);
      }
    } else {
      el.removeAttribute('data-comp-locked');
      el.style.boxShadow = '';
      var ov = el.querySelector('[data-comp-lock-overlay]');
      var badge = el.querySelector('[data-comp-lock-badge]');
      if (ov) ov.remove();
      if (badge) badge.remove();
    }
  }

  window.addEventListener('message', function(ev) {
    var m = ev.data || {};
    if (!m || m.source !== 'comp-studio-parent') return;
    if (m.type === 'recollect') { collect(); return; }
    if (m.type === 'highlight') { highlight(m.id); return; }
    if (m.type === 'deleteBlock') { var el = findById(m.id); if (el) el.remove(); collect(); return; }
    if (m.type === 'replaceText') { var el = findById(m.id); if (el) el.textContent = m.text; collect(); return; }
    if (m.type === 'setLock') { setLock(m.id, !!m.locked); collect(); return; }
    if (m.type === 'replaceImage') {
      var el = findById(m.id);
      if (!el) { collect(); return; }
      if (el.tagName === 'IMG') {
        swapImgSrc(el, m.url);
      } else {
        // Non-IMG element carrying a CSS variable background. Override the
        // var() reference by writing the new URL to background-image inline
        // and locking the element to its current dimensions so layout stays
        // stable. Preserves aspect via object-fit-style cover behavior.
        var cw = el.offsetWidth || 0;
        var ch = el.offsetHeight || 0;
        el.style.backgroundImage = 'url("' + m.url + '")';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
        el.style.backgroundRepeat = 'no-repeat';
        if (cw && ch) {
          el.style.width = cw + 'px';
          el.style.height = ch + 'px';
        }
      }
      collect();
      return;
    }
    if (m.type === 'replaceAdWithImage') {
      var el = findById(m.id);
      if (!el) return;
      var w = el.offsetWidth || 0;
      var h = el.offsetHeight || 0;
      if (!w || !h) {
        var ds = (el.getAttribute('data-ad-size') || '300x250').split('x');
        if (!w) w = parseInt(ds[0], 10) || 300;
        if (!h) h = parseInt(ds[1], 10) || 250;
      }
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.display = 'block';
      el.style.overflow = 'hidden';
      el.innerHTML = '<img src="' + m.url + '" alt="' + (m.alt || '') + '" style="width:100%;height:100%;object-fit:cover;display:block;" />';
      collect();
      return;
    }
    if (m.type === 'inlineEdit') {
      var el = findById(m.id);
      if (!el) return;
      el.setAttribute('contenteditable', 'true');
      el.focus();
      var handler = function() {
        el.removeAttribute('contenteditable');
        el.removeEventListener('blur', handler);
        parent.postMessage({ source: 'comp-studio', type: 'inlineEdited', id: m.id, text: (el.textContent || '').trim() }, '*');
        collect();
      };
      el.addEventListener('blur', handler);
      return;
    }
    if (m.type === 'replaceVideoSrc') {
      var vEl = findById(m.id);
      if (!vEl) return;
      var newUrl = String(m.url || '').trim();
      if (!newUrl) return;
      // Normalize YouTube watch/short URLs to the embed form so the iframe
      // still renders after the swap.
      var ytM = newUrl.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|youtube\\.com\\/shorts\\/|youtube\\.com\\/embed\\/)([A-Za-z0-9_-]+)/i);
      var embedUrl = ytM ? ('https://www.youtube.com/embed/' + ytM[1]) : newUrl;
      if (vEl.getAttribute('data-comp-video-placeholder') === '1') {
        // Placeholder img — update the thumbnail AND the stored iframe HTML
        // so export restores with the new URL.
        if (ytM) vEl.setAttribute('src', 'https://img.youtube.com/vi/' + ytM[1] + '/hqdefault.jpg');
        vEl.setAttribute('data-comp-video-src', embedUrl);
        var raw = vEl.getAttribute('data-comp-original-html') || '';
        if (raw) {
          try {
            var decoded = decodeURIComponent(raw);
            decoded = decoded.replace(/\\ssrc\\s*=\\s*(["'])[^"']*\\1/i, ' src="' + embedUrl + '"');
            vEl.setAttribute('data-comp-original-html', encodeURIComponent(decoded));
          } catch (_) {}
        }
      } else {
        vEl.setAttribute('src', embedUrl);
      }
      collect();
      return;
    }
    if (m.type === 'applyLogoEdit') {
      var lEl = findById(m.id);
      if (!lEl) return;
      var newSrc = String(m.newSrc || '').trim();
      if (!newSrc) return;
      if (lEl.tagName === 'IMG') {
        swapImgSrc(lEl, newSrc);
      } else {
        // CSS-background logo — paint the new URL inline on the element AND
        // inject a scoped style to override the ::before pseudo in case the
        // original mark was painted there.
        lEl.style.backgroundImage = 'url("' + newSrc + '")';
        if (!lEl.style.backgroundSize)     lEl.style.backgroundSize = 'contain';
        if (!lEl.style.backgroundPosition) lEl.style.backgroundPosition = 'center';
        if (!lEl.style.backgroundRepeat)   lEl.style.backgroundRepeat = 'no-repeat';
        var styleId = 'comp-logo-override-' + m.id;
        var existing = document.getElementById(styleId);
        if (existing) existing.remove();
        var safeId = String(m.id).replace(/"/g, '\\\\"');
        var styleEl = document.createElement('style');
        styleEl.id = styleId;
        styleEl.setAttribute('data-comp-skip', '1');
        styleEl.textContent =
          '[data-comp-id="' + safeId + '"]::before, [data-comp-id="' + safeId + '"]:before {' +
          ' background-image: url("' + newSrc + '") !important;' +
          ' background-size: contain !important;' +
          ' background-position: center !important;' +
          ' background-repeat: no-repeat !important;' +
          '}';
        document.head.appendChild(styleEl);
      }
      collect();
      return;
    }
    if (m.type === 'replaceHeaderFooterWithScreenshot') {
      var hfEl = findById(m.id);
      if (!hfEl) return;
      var dataUrl = String(m.dataUrl || '').trim();
      if (!dataUrl) return;
      var ow = hfEl.offsetWidth || 0;
      var hfImg = document.createElement('img');
      hfImg.setAttribute('src', dataUrl);
      hfImg.setAttribute('data-comp-id', m.id);
      hfImg.setAttribute('data-comp-hfs-screenshot', '1');
      hfImg.setAttribute('data-comp-hfs-type', String(m.blockType || ''));
      hfImg.setAttribute('data-comp-original-html', encodeURIComponent(hfEl.outerHTML));
      hfImg.style.display = 'block';
      hfImg.style.width = '100%';
      if (ow) hfImg.style.maxWidth = ow + 'px';
      if (hfEl.parentNode) hfEl.parentNode.replaceChild(hfImg, hfEl);
      collect();
      return;
    }
    if (m.type === 'replaceVideoWithImage') {
      var vEl2 = findById(m.id);
      if (!vEl2) return;
      var imgUrl = String(m.url || '').trim();
      if (!imgUrl) return;
      // Capture dimensions from whatever the placeholder/iframe reports,
      // falling back to a 16:9 slot so an in-flight layout doesn't collapse
      // the new image to 0×0.
      var vw = vEl2.offsetWidth
            || parseInt(vEl2.getAttribute('width') || '0', 10)
            || vEl2.width || 0;
      var vh = vEl2.offsetHeight
            || parseInt(vEl2.getAttribute('height') || '0', 10)
            || vEl2.height || 0;
      if (!vw) vw = 640;
      if (!vh) vh = Math.round(vw * 9 / 16);
      var existingId = vEl2.getAttribute('data-comp-id');
      var parent = vEl2.parentElement;
      var img = document.createElement('img');
      img.setAttribute('src', imgUrl);
      img.setAttribute('width', String(vw));
      img.setAttribute('height', String(vh));
      if (existingId) img.setAttribute('data-comp-id', existingId);
      // Explicit inline styles — don't copy the placeholder's whole style
      // blob (which can carry a background or fixed cursor that looks odd
      // on a photo). Width:100% + pixel height reproduces the original
      // layout slot across breakpoints.
      img.style.display = 'block';
      img.style.width = '100%';
      img.style.height = vh + 'px';
      img.style.maxWidth = vw + 'px';
      img.style.objectFit = 'cover';
      if (parent) parent.replaceChild(img, vEl2);
      console.log('[comp-studio] video → image swap:', { id: m.id, vw: vw, vh: vh, size: (imgUrl.length / 1024 | 0) + 'KB' });
      collect();
      return;
    }
    if (m.type === 'updateCardFields') {
      var el = findById(m.id);
      if (!el) return;
      var f = m.fields || {};
      if (typeof f.imageUrl === 'string' && f.imageUrl) {
        var cImg = el.querySelector('img');
        if (cImg) swapImgSrc(cImg, f.imageUrl);
      }
      if (typeof f.headline === 'string') {
        var cH = el.querySelector('h1,h2,h3,h4,h5');
        if (cH) {
          // Preserve a link wrapper inside the heading if present — only
          // rewrite the text, not the anchor element.
          var hLink = cH.querySelector('a');
          if (hLink) hLink.textContent = f.headline;
          else cH.textContent = f.headline;
        }
      }
      if (typeof f.body === 'string') {
        var cP = el.querySelector('p');
        if (cP) cP.textContent = f.body;
      }
      if (typeof f.buttonText === 'string' && f.buttonText) {
        var cBtn = el.querySelector('a.btn, button, .cta, [class*="button"], a[class*="btn"], a[class*="cta"]');
        if (!cBtn) cBtn = el.querySelector('a');
        if (cBtn) cBtn.textContent = f.buttonText;
      }
      if (typeof f.buttonUrl === 'string' && f.buttonUrl) {
        var cBtnLink = el.querySelector('a.btn, a.cta, a[class*="btn"], a[class*="cta"]');
        if (!cBtnLink) cBtnLink = el.querySelector('a');
        if (cBtnLink) cBtnLink.setAttribute('href', f.buttonUrl);
      }
      collect();
      return;
    }
    if (m.type === 'replaceDocumentHtml') {
      try {
        document.open(); document.write(m.html); document.close();
      } catch {}
      return;
    }
    if (m.type === 'extractLockedHtml') {
      // Return a snapshot of the locked block's outerHTML keyed by id
      var out = {};
      (m.ids || []).forEach(function(id) {
        var el = findById(id);
        if (el) out[id] = el.outerHTML;
      });
      parent.postMessage({ source: 'comp-studio', type: 'extractedLocked', map: out }, '*');
      return;
    }
    if (m.type === 'serialize') {
      // Export serializes the comp AS THE USER SEES IT. That means we keep
      // the video-slot placeholder imgs (or whatever the user uploaded in
      // their place) instead of restoring the original iframes. Restoring
      // the iframe on export caused Puppeteer to render a cross-origin
      // blocked YouTube frame and the user saw "original html" in the JPEG.
      parent.postMessage({ source: 'comp-studio', type: 'serialized', html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML }, '*');
      return;
    }
    if (m.type === 'serializeStripped') {
      // Serialize the DOM with locked blocks replaced by placeholders so the
      // master prompt never rewrites locked regions. Parent re-injects them.
      // Video placeholders are left in place so the master prompt sees the
      // same visual the user sees rather than the original iframe.
      var cloneRoot = document.documentElement.cloneNode(true);
      var locked = cloneRoot.querySelectorAll('[data-comp-locked="1"]');
      locked.forEach(function(el) {
        var placeholder = cloneRoot.ownerDocument.createElement('div');
        placeholder.setAttribute('data-comp-locked-placeholder', el.getAttribute('data-comp-id') || '');
        placeholder.textContent = '[[LOCKED_BLOCK:' + (el.getAttribute('data-comp-id') || '') + ']]';
        el.replaceWith(placeholder);
      });
      parent.postMessage({ source: 'comp-studio', type: 'serializedStripped', html: '<!DOCTYPE html>\\n' + cloneRoot.outerHTML }, '*');
      return;
    }
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') collect();
  else window.addEventListener('DOMContentLoaded', collect);
  window.addEventListener('load', collect);
})();
`;

function injectScript(html) {
  const tag = `<script data-comp-skip="1">${INJECTED_SCRIPT}</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, tag + '</body>');
  return html + tag;
}

function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--text)', color: 'var(--card)', padding: '10px 18px',
      borderRadius: 8, fontSize: 13, zIndex: 1000, boxShadow: 'var(--shadow-card)',
    }}>{message}</div>
  );
}

function formatRelative(ms) {
  if (!ms) return 'just now';
  const delta = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  const m = Math.floor(delta / 60);
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

// ─── Accordion header ──────────────────────────────────────────────────────
function Section({ title, isOpen, onToggle, children }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border-light)' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', background: 'transparent', border: 'none',
          cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
          textTransform: 'uppercase', color: 'var(--text)', fontFamily: 'var(--font-ui)',
        }}
      >
        <span>{title}</span>
        <span style={{ color: 'var(--text-light)', fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div style={{ padding: '4px 12px 14px' }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Block row (inside Blocks section) ─────────────────────────────────────
function BlockRow({ block, selected, onSelect, onToggleLock, onAction, category, rawHtml, setToast }) {
  const active = selected?.id === block.id;
  const typeIcon = block.type === 'ad' ? '◨' : block.type === 'image' ? '▣' : block.type === 'heading' ? 'H' : block.type === 'paragraph' ? '¶' : block.type === 'nav' ? '☰' : block.type === 'header' ? '⎯' : block.type === 'footer' ? '⎯' : block.type === 'card' ? '▤' : '·';

  return (
    <div
      data-block-row-id={block.id}
      style={{
        borderRadius: 8,
        border: active ? '1.5px solid var(--green)' : '1px solid var(--border)',
        borderLeft: active ? '4px solid var(--amber)' : (active ? '1.5px solid var(--green)' : '1px solid var(--border)'),
        background: active ? 'var(--green)' : 'var(--card)',
        color: active ? '#fff' : 'var(--text-mid)',
        transition: 'all 0.15s',
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => onSelect(block)}
        style={{ padding: '8px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
      >
        <span style={{ width: 14, flexShrink: 0, textAlign: 'center', opacity: 0.7 }}>{typeIcon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
            color: active ? 'var(--amber-light)' : 'var(--amber)',
          }}>{block.eyebrow}</div>
          <div style={{
            fontSize: 13, fontWeight: active ? 700 : 600, color: active ? '#fff' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{block.name}</div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleLock(block); }}
          title={block.locked ? 'Unlock block' : 'Lock block (preserved by master prompt)'}
          style={{
            flexShrink: 0, background: block.locked ? 'var(--amber)' : 'transparent',
            border: `1px solid ${block.locked ? 'var(--amber)' : (active ? 'rgba(255,255,255,0.4)' : 'var(--border)')}`,
            color: block.locked ? '#fff' : (active ? '#fff' : 'var(--text-light)'),
            borderRadius: 6, padding: '2px 6px', fontSize: 10, cursor: 'pointer',
          }}
        >🔒</button>
      </div>

      {active && (
        <div style={{ background: 'var(--card)', color: 'var(--text)', padding: 10, borderTop: '1px solid var(--border-light)' }}>
          {block.type === 'ad' ? (
            <AdEditPanel block={block} category={category} onAction={onAction} setToast={setToast} />
          ) : block.type === 'image' ? (
            <ImageEditPanel block={block} category={category} onAction={onAction} setToast={setToast} />
          ) : block.type === 'logo' ? (
            <LogoEditPanel block={block} onAction={onAction} setToast={setToast} />
          ) : block.type === 'card' ? (
            <CardEditPanel block={block} onAction={onAction} setToast={setToast} />
          ) : block.type === 'video' ? (
            <VideoEditPanel block={block} onAction={onAction} setToast={setToast} />
          ) : block.type === 'header' || block.type === 'footer' ? (
            <HeaderFooterEditPanel block={block} onAction={onAction} setToast={setToast} />
          ) : (
            <TextEditPanel block={block} category={category} onAction={onAction} setToast={setToast} rawHtml={rawHtml} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Text edit panel (inline) ──────────────────────────────────────────────
function TextEditPanel({ block, category, onAction, setToast, rawHtml }) {
  const [draft, setDraft] = useState(block.preview || '');
  const [instruction, setInstruction] = useState('');
  const [generated, setGenerated] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setDraft(block.preview || ''); setGenerated(''); setInstruction(''); }, [block.id, block.preview]);

  const generate = async () => {
    if (!instruction.trim()) return;
    setLoading(true); setGenerated('');
    try {
      const res = await fetch('/api/comp-studio/generate-copy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          blockType: block.type,
          blockLabel: block.name,
          surroundingContext: (rawHtml || '').slice(0, 2000),
          userInstruction: instruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed');
      setGenerated(data.generated_text || '');
    } catch (e) { setToast('Generate failed: ' + e.message); }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" className="db-btn" onClick={() => onAction({ type: 'inlineEdit', id: block.id })}>
        Inline edit in preview
      </button>
      <div>
        <label className="form-label" style={{ fontSize: 10 }}>Replacement text</label>
        <textarea className="form-textarea" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button className="btn-accent" style={{ marginTop: 4 }}
          onClick={() => onAction({ type: 'replaceText', id: block.id, text: draft, label: block.name, original: block.preview })}>
          Apply
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>✦ AI COPY</div>
        <textarea className="form-textarea" rows={2} placeholder="Tighten this to 20 words, keep voice playful…"
          value={instruction} onChange={(e) => setInstruction(e.target.value)} />
        <button className="btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={generate}
          disabled={loading || !instruction.trim()}>
          {loading ? 'Generating…' : 'Generate'}
        </button>
        {generated && (
          <div style={{ marginTop: 8, padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>{generated}</div>
            <button className="btn-accent"
              onClick={() => onAction({ type: 'replaceText', id: block.id, text: generated, label: block.name, original: block.preview })}>
              Apply
            </button>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button className="btn-danger-sm" onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}>Delete block</button>
      </div>
    </div>
  );
}

// ─── Image edit panel ──────────────────────────────────────────────────────
function ImageEditPanel({ block, category, onAction, setToast }) {
  const [direction, setDirection] = useState('');
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  // Inline error shown below the Generate button — never silent-fail.
  const [error, setError] = useState('');

  useEffect(() => { setDirection(''); setGenerated(null); setError(''); }, [block.id]);

  const upload = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      const url = `data:${mime};base64,${b64}`;
      onAction({ type: 'replaceImage', id: block.id, url, label: block.name, dimensions: `${block.imgW}x${block.imgH}` });
    } catch (e) { setToast('Image upload failed: ' + e.message); }
  };

  const generate = async () => {
    if (!direction.trim()) return;
    setLoading(true); setGenerated(null); setError('');
    const adSize = `${block.imgW || 600}x${block.imgH || 400}`;
    const payload = {
      category,
      adSize,
      adLabel: block.name || 'image',
      userDirection: direction,
    };
    console.log('[generate-image/image-block] POST payload:', payload);
    try {
      const res = await fetch('/api/comp-studio/generate-image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      console.log(`[generate-image/image-block] response status=${res.status} body=`, rawText.slice(0, 500));
      let data;
      try { data = JSON.parse(rawText); }
      catch { throw new Error(`Server returned non-JSON: ${rawText.slice(0, 160)}`); }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.image_url) throw new Error('Server returned no image_url');
      setGenerated({ url: data.image_url, prompt: data.prompt_used });
    } catch (e) {
      console.error('[generate-image/image-block] generate failed:', e);
      setError(e.message || 'Generation failed');
      setToast('Generate failed: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
        Image — {block.imgW}×{block.imgH}
      </div>
      <label className="btn-secondary" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
        Upload replacement
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>✦ AI IMAGE</div>
        <textarea className="form-textarea" rows={2}
          placeholder="Describe the visual style, subject, or mood…"
          value={direction} onChange={(e) => setDirection(e.target.value)} />
        <button className="btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={generate} disabled={loading || !direction.trim()}>
          {loading ? `Generating ${block.imgW}×${block.imgH}…` : 'Generate Image'}
        </button>
        {error && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, fontSize: 12, color: 'var(--error)' }}>
            {error}
          </div>
        )}
        {generated && (
          <div style={{ marginTop: 8 }}>
            <img src={generated.url} alt="" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn-accent"
                onClick={() => onAction({ type: 'replaceImage', id: block.id, url: generated.url, label: block.name, dimensions: `${block.imgW}x${block.imgH}` })}>
                Apply
              </button>
              <button className="btn-ghost" onClick={generate}>Regenerate</button>
            </div>
          </div>
        )}
      </div>
      <button className="btn-danger-sm" onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}>Delete block</button>
    </div>
  );
}

// ─── Ad edit panel ─────────────────────────────────────────────────────────
function AdEditPanel({ block, category, onAction, setToast }) {
  const [direction, setDirection] = useState('');
  const [generated, setGenerated] = useState(null);
  const [loading, setLoading] = useState(false);
  // Inline error shown below the Generate button.
  const [error, setError] = useState('');

  useEffect(() => { setDirection(''); setGenerated(null); setError(''); }, [block.id]);

  const upload = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      const url = `data:${mime};base64,${b64}`;
      onAction({ type: 'replaceAdWithImage', id: block.id, url, alt: block.adLabel, adSize: block.adSize, adLabel: block.adLabel });
    } catch (e) { setToast('Upload failed: ' + e.message); }
  };

  const generate = async () => {
    if (!direction.trim()) return;
    setLoading(true); setGenerated(null); setError('');
    const payload = {
      category,
      adSize: block.adSize || '300x250',
      adLabel: block.adLabel || 'Ad',
      userDirection: direction,
    };
    console.log('[generate-image/ad-block] POST payload:', payload);
    try {
      const res = await fetch('/api/comp-studio/generate-image', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      console.log(`[generate-image/ad-block] response status=${res.status} body=`, rawText.slice(0, 500));
      let data;
      try { data = JSON.parse(rawText); }
      catch { throw new Error(`Server returned non-JSON: ${rawText.slice(0, 160)}`); }
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (!data?.image_url) throw new Error('Server returned no image_url');
      setGenerated({ url: data.image_url, prompt: data.prompt_used });
    } catch (e) {
      console.error('[generate-image/ad-block] generate failed:', e);
      setError(e.message || 'Generation failed');
      setToast('Generate failed: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
        {block.adLabel} · {block.adSize}
      </div>
      <label className="btn-secondary" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer' }}>
        Upload creative
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 8 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>✦ GENERATE CREATIVE</div>
        <textarea className="form-textarea" rows={2} placeholder="Describe the creative direction…"
          value={direction} onChange={(e) => setDirection(e.target.value)} />
        <button className="btn-primary" style={{ width: '100%', marginTop: 4 }} onClick={generate} disabled={loading || !direction.trim()}>
          {loading ? `Generating ${block.adSize}…` : 'Generate'}
        </button>
        {error && (
          <div style={{ marginTop: 6, padding: '6px 10px', background: 'var(--error-bg)', border: '1px solid var(--error-border)', borderRadius: 6, fontSize: 12, color: 'var(--error)' }}>
            {error}
          </div>
        )}
        {generated && (
          <div style={{ marginTop: 8 }}>
            <img src={generated.url} alt="" style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="btn-accent"
                onClick={() => onAction({ type: 'replaceAdWithImage', id: block.id, url: generated.url, alt: block.adLabel, adSize: block.adSize, adLabel: block.adLabel })}>
                Apply
              </button>
              <button className="btn-ghost" onClick={generate}>Regenerate</button>
            </div>
          </div>
        )}
      </div>
      <button className="btn-danger-sm" onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}>Delete block</button>
    </div>
  );
}

// ─── Video edit panel ──────────────────────────────────────────────────────
// Video blocks get two knobs: swap the iframe src, or replace the iframe
// with a static image at the same dimensions. No player UI.
function VideoEditPanel({ block, onAction, setToast }) {
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const w = block.videoW || 0;
  const h = block.videoH || 0;
  const dims = w && h ? `${w}×${h}` : 'video slot';

  useEffect(() => { setImageUrl(''); }, [block.id]);

  const apply = (url) => {
    const val = String(url || '').trim();
    if (!val) return;
    onAction({
      type: 'replaceVideoWithImage',
      id: block.id,
      url: val,
      label: block.name,
      dimensions: `${w}x${h}`,
    });
  };

  const upload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      // FileReader.readAsDataURL handles large images correctly; the prior
      // btoa(Array.from(Uint8Array)...) pattern OOMs / silently corrupts
      // payloads past a few MB, which manifested as "nothing happened" when
      // replacing a video with an uploaded image.
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Read failed'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      apply(String(dataUrl));
    } catch (e) {
      setToast && setToast('Upload failed: ' + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
        textTransform: 'uppercase', color: 'var(--text-mid)',
      }}>
        Video slot — upload replacement image
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
        The original video embed is hidden in the comp. Upload an image
        (screenshot, poster art, thumbnail) to fill the {dims} slot.
      </div>

      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '10px 16px', borderRadius: 6,
        border: '1.5px dashed var(--border)', cursor: 'pointer',
        fontSize: 13, color: 'var(--text-mid)', background: 'var(--bg)',
      }}>
        {uploading ? 'Uploading…' : `Upload image (${dims})`}
        <input
          type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </label>

      <div style={{ borderTop: '1px solid var(--border-faint)', paddingTop: 10 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Or paste image URL</label>
        <input
          className="form-input"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://… image URL"
        />
        <button className="btn-accent" style={{ marginTop: 4 }} onClick={() => apply(imageUrl)}>
          Apply URL
        </button>
      </div>

      <button
        className="btn-danger-sm"
        onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}
      >
        Delete block
      </button>
    </div>
  );
}

// ─── Header / Footer edit panel ────────────────────────────────────────────
// The header/footer regions of a saved page are structurally dense (nav,
// search, logo, icons, banners, etc). Editing individual elements inside
// rarely matches the user's mental model — they typically want a clean
// screenshot of the desired header/footer from the live site. Upload the
// screenshot and we replace the entire region with an <img> at the same
// slot, preserving the original markup in data-comp-original-html for
// later export or restore.
function HeaderFooterEditPanel({ block, onAction, setToast }) {
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const label = block.type === 'header' ? 'Header' : 'Footer';

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      const dataUrl = `data:${mime};base64,${b64}`;
      setPreview(dataUrl);
      onAction({
        type: 'replaceHeaderFooterWithScreenshot',
        id: block.id,
        dataUrl,
        blockType: block.type,
        label: block.name,
      });
      setToast && setToast(`${label} replaced with screenshot.`);
    } catch (e) {
      setToast && setToast('Upload failed: ' + (e?.message || e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
        textTransform: 'uppercase', color: 'var(--text-mid)',
      }}>
        {label} — replace with screenshot
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5 }}>
        Screenshot the {label.toLowerCase()} from the live site, then upload it
        here. The {label.toLowerCase()} will be replaced with your image in
        the comp preview. Original markup is kept for export.
      </div>
      {preview && (
        <img
          src={preview}
          alt=""
          style={{
            width: '100%', maxHeight: 180, objectFit: 'contain',
            borderRadius: 4, border: '1px solid var(--border)',
            background: 'var(--bg)',
          }}
        />
      )}
      <label style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 8, padding: '10px 16px', borderRadius: 6,
        border: '1.5px dashed var(--border)', cursor: 'pointer',
        fontSize: 13, color: 'var(--text-mid)', background: 'var(--bg)',
      }}>
        {uploading ? 'Uploading…' : `Upload ${label.toLowerCase()} screenshot`}
        <input
          type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>
      <button
        className="btn-danger-sm"
        onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}
      >
        Delete {label.toLowerCase()}
      </button>
    </div>
  );
}

// ─── Logo edit panel ───────────────────────────────────────────────────────
// Minimal single-field panel for the site logo. Reuses the replaceImage
// iframe handler so srcset/sizes are cleared and dimensions are locked.
function LogoEditPanel({ block, onAction, setToast }) {
  const [url, setUrl] = useState(block.currentSrc || '');
  useEffect(() => { setUrl(block.currentSrc || ''); }, [block.id, block.currentSrc]);

  const upload = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      setUrl(`data:${mime};base64,${b64}`);
    } catch (e) { setToast('Upload failed: ' + e.message); }
  };

  const apply = () => {
    if (!url.trim()) return;
    if (block.isCssBg) {
      onAction({
        type: 'applyLogoEdit',
        id: block.id,
        newSrc: url.trim(),
        isCssBg: true,
        label: block.name,
        dimensions: `${block.imgW || 0}x${block.imgH || 0}`,
      });
    } else {
      onAction({
        type: 'replaceImage',
        id: block.id,
        url: url.trim(),
        label: block.name,
        dimensions: `${block.imgW || 0}x${block.imgH || 0}`,
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-mid)' }}>
        Logo{block.isCssBg ? ' (CSS background)' : ''} — {block.imgW || '?'}×{block.imgH || '?'}
      </div>
      {url && (
        <img
          src={url}
          alt=""
          style={{
            maxHeight: 48, objectFit: 'contain', alignSelf: 'flex-start',
            background: 'var(--bg)', padding: 4, borderRadius: 4, border: '1px solid var(--border)',
          }}
        />
      )}
      <label className="form-label" style={{ fontSize: 10 }}>Logo image URL</label>
      <input
        className="form-input"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… logo image URL"
      />
      <label className="btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}>
        Upload file…
        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      <button className="btn-accent" onClick={apply}>Apply</button>
    </div>
  );
}

// ─── Card edit panel (structured) ───────────────────────────────────────────
// Cards bundle image + headline + body + button. Editing them through the
// plain-text panel used to wipe the whole container via textContent. This
// panel exposes each field separately and dispatches a single per-field
// update action — the iframe handler then targets only the relevant child.
function CardEditPanel({ block, onAction, setToast }) {
  const initial = block.cardFields || { imageUrl: '', headline: '', body: '', buttonText: '', buttonUrl: '' };
  const [fields, setFields] = useState(initial);

  useEffect(() => {
    setFields(block.cardFields || { imageUrl: '', headline: '', body: '', buttonText: '', buttonUrl: '' });
  }, [block.id, block.cardFields]);

  const upload = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      const url = `data:${mime};base64,${b64}`;
      setFields(f => ({ ...f, imageUrl: url }));
    } catch (e) { setToast('Image upload failed: ' + e.message); }
  };

  const apply = () => {
    onAction({
      type: 'updateCardFields',
      id: block.id,
      fields,
      label: block.name,
      original: block.cardFields || {},
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="eyebrow" style={{ fontSize: 10 }}>CARD FIELDS</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Image URL</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 0 }}
            value={fields.imageUrl}
            onChange={(e) => setFields(f => ({ ...f, imageUrl: e.target.value }))}
            placeholder="https://…"
          />
          {fields.imageUrl && (
            <img
              src={fields.imageUrl}
              alt=""
              style={{ width: 52, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }}
            />
          )}
        </div>
        <label className="btn-ghost" style={{ alignSelf: 'flex-start', cursor: 'pointer', fontSize: 11, padding: '4px 8px' }}>
          Upload image…
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Headline</label>
        <input
          className="form-input"
          value={fields.headline}
          onChange={(e) => setFields(f => ({ ...f, headline: e.target.value }))}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Body copy</label>
        <textarea
          className="form-textarea"
          rows={3}
          value={fields.body}
          onChange={(e) => setFields(f => ({ ...f, body: e.target.value }))}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Button text</label>
        <input
          className="form-input"
          value={fields.buttonText}
          onChange={(e) => setFields(f => ({ ...f, buttonText: e.target.value }))}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label className="form-label" style={{ fontSize: 10 }}>Button URL</label>
        <input
          className="form-input"
          value={fields.buttonUrl}
          onChange={(e) => setFields(f => ({ ...f, buttonUrl: e.target.value }))}
          placeholder="https://…"
        />
      </div>

      <button className="btn-accent" onClick={apply}>Apply</button>
      <button
        className="btn-danger-sm"
        onClick={() => onAction({ type: 'delete', id: block.id, label: block.name, preview: block.preview })}
      >
        Delete block
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function CompStudio() {
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [rawHtml, setRawHtml] = useState('');
  const [iframeHtml, setIframeHtml] = useState('');
  const [stripStats, setStripStats] = useState({ scriptsRemoved: 0, adsPreserved: 0 });
  const [cleaning, setCleaning] = useState(false);
  // Tracks the uploaded file's size so the File section can show it + warn
  // on oversize SingleFile captures that might slow block detection.
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null); // { name, bytes }
  const [blocks, setBlocks] = useState([]);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [viewport, setViewport] = useState('desktop');
  const [zoom, setZoom] = useState(1);
  const [sessionChanges, setSessionChanges] = useState([]);
  const [toast, setToast] = useState('');
  const [category, setCategory] = useState('general');
  const [templateName, setTemplateName] = useState('Untitled Comp');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [fixRelative, setFixRelative] = useState(true);
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [firstAutoSaveDone, setFirstAutoSaveDone] = useState(false);

  const [masterPromptText, setMasterPromptText] = useState('');
  const [masterRef, setMasterRef] = useState(null); // { data:, name: }
  const [masterRunning, setMasterRunning] = useState(false);

  // Accordion open state
  const [openSections, setOpenSections] = useState({
    file: false, master: false, viewport: false,
    blocks: true, draft: false, export: false,
  });
  const toggleSection = (k) => setOpenSections(p => ({ ...p, [k]: !p[k] }));

  const iframeRef = useRef(null);
  // Ref to the latest `selectBlock` function so the once-registered message
  // listener can always invoke the current implementation without stale deps.
  const selectBlockRef = useRef(null);
  // Fresh reference to the blocks array for lookups inside the message
  // listener. useState closure is stale inside the empty-deps useEffect.
  const blocksRef = useRef([]);

  // Responsive gate
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Mark dirty whenever inputs change
  useEffect(() => { if (rawHtml) setDirty(true); }, [sessionChanges, rawHtml, templateName, category, sourceUrl, description]);

  // iframe messages
  const serializeResolverRef = useRef(null);
  const serializeStrippedResolverRef = useRef(null);
  const extractLockedResolverRef = useRef(null);

  useEffect(() => {
    const onMessage = (ev) => {
      const m = ev.data || {};
      if (!m || m.source !== 'comp-studio') return;
      if (m.type === 'blocks') setBlocks(m.blocks || []);
      if (m.type === 'debug') {
        console.log('[comp-studio/iframe]', m.note, m.inventory || '');
      }
      if (m.type === 'inlineEdited') {
        setSessionChanges(sc => [...sc, { action: 'text', label: m.id, updated: m.text }]);
      }
      if (m.type === 'blockClick') {
        // Identical code path to clicking a block row in the left rail — see
        // selectBlockRef below. A ref is used because this useEffect closes
        // over the initial render, but selectBlock is re-created per render.
        const fn = selectBlockRef.current;
        if (fn) fn(m.id);
        else console.warn('[comp-studio] blockClick fired before selectBlock ready');
      }
      if (m.type === 'serialized') {
        if (serializeResolverRef.current) { serializeResolverRef.current(m.html); serializeResolverRef.current = null; }
      }
      if (m.type === 'serializedStripped') {
        if (serializeStrippedResolverRef.current) { serializeStrippedResolverRef.current(m.html); serializeStrippedResolverRef.current = null; }
      }
      if (m.type === 'extractedLocked') {
        if (extractLockedResolverRef.current) { extractLockedResolverRef.current(m.map || {}); extractLockedResolverRef.current = null; }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function serializeIframe() {
    return new Promise((resolve) => {
      serializeResolverRef.current = resolve;
      iframeRef.current?.contentWindow?.postMessage({ source: 'comp-studio-parent', type: 'serialize' }, '*');
      setTimeout(() => {
        if (serializeResolverRef.current) { serializeResolverRef.current(rawHtml); serializeResolverRef.current = null; }
      }, 2000);
    });
  }
  function serializeStripped() {
    return new Promise((resolve) => {
      serializeStrippedResolverRef.current = resolve;
      iframeRef.current?.contentWindow?.postMessage({ source: 'comp-studio-parent', type: 'serializeStripped' }, '*');
      setTimeout(() => {
        if (serializeStrippedResolverRef.current) { serializeStrippedResolverRef.current(rawHtml); serializeStrippedResolverRef.current = null; }
      }, 2000);
    });
  }
  function extractLocked(ids) {
    return new Promise((resolve) => {
      extractLockedResolverRef.current = resolve;
      iframeRef.current?.contentWindow?.postMessage({ source: 'comp-studio-parent', type: 'extractLockedHtml', ids }, '*');
      setTimeout(() => {
        if (extractLockedResolverRef.current) { extractLockedResolverRef.current({}); extractLockedResolverRef.current = null; }
      }, 1500);
    });
  }

  const postToIframe = (msg) => {
    iframeRef.current?.contentWindow?.postMessage({ source: 'comp-studio-parent', ...msg }, '*');
  };

  // Perform action dispatched from block edit panels
  const handleBlockAction = (action) => {
    if (action.type === 'replaceText') {
      postToIframe({ type: 'replaceText', id: action.id, text: action.text });
      setSessionChanges(sc => [...sc, { action: 'text', label: action.label, original: action.original, updated: action.text }]);
      setToast('Text updated.');
    } else if (action.type === 'updateCardFields') {
      postToIframe({ type: 'updateCardFields', id: action.id, fields: action.fields });
      const f = action.fields || {};
      const orig = action.original || {};
      const diffs = [];
      if (f.imageUrl !== orig.imageUrl)   diffs.push('image');
      if (f.headline !== orig.headline)   diffs.push('headline');
      if (f.body !== orig.body)           diffs.push('body');
      if (f.buttonText !== orig.buttonText) diffs.push('button');
      if (f.buttonUrl !== orig.buttonUrl) diffs.push('button URL');
      setSessionChanges(sc => [...sc, {
        action: 'text',
        label: action.label,
        original: orig.headline || '',
        updated: `Card fields: ${diffs.join(', ') || 'no changes'}`,
      }]);
      setToast(diffs.length ? `Card updated (${diffs.join(', ')}).` : 'No card changes.');
    } else if (action.type === 'inlineEdit') {
      postToIframe({ type: 'inlineEdit', id: action.id });
    } else if (action.type === 'replaceImage') {
      postToIframe({ type: 'replaceImage', id: action.id, url: action.url });
      setSessionChanges(sc => [...sc, { action: 'image', label: action.label, dimensions: action.dimensions }]);
      setToast('Image replaced.');
    } else if (action.type === 'replaceAdWithImage') {
      postToIframe({ type: 'replaceAdWithImage', id: action.id, url: action.url, alt: action.alt });
      setSessionChanges(sc => [...sc, { action: 'ad', adSize: action.adSize, adLabel: action.adLabel, method: 'creative applied' }]);
      setToast('Creative applied.');
    } else if (action.type === 'applyLogoEdit') {
      postToIframe({ type: 'applyLogoEdit', id: action.id, newSrc: action.newSrc, isCssBg: !!action.isCssBg });
      setSessionChanges(sc => [...sc, { action: 'image', label: action.label, dimensions: action.dimensions }]);
      setToast('Logo updated.');
    } else if (action.type === 'replaceHeaderFooterWithScreenshot') {
      postToIframe({ type: 'replaceHeaderFooterWithScreenshot', id: action.id, dataUrl: action.dataUrl, blockType: action.blockType });
      setSessionChanges(sc => [...sc, { action: 'image', label: action.label, dimensions: action.blockType || '' }]);
    } else if (action.type === 'replaceVideoSrc') {
      postToIframe({ type: 'replaceVideoSrc', id: action.id, url: action.url });
      setSessionChanges(sc => [...sc, { action: 'text', label: action.label, original: '(video src)', updated: action.url }]);
      setToast('Video URL updated.');
    } else if (action.type === 'replaceVideoWithImage') {
      postToIframe({ type: 'replaceVideoWithImage', id: action.id, url: action.url });
      setSessionChanges(sc => [...sc, { action: 'image', label: action.label, dimensions: action.dimensions }]);
      setToast('Video replaced with image.');
    } else if (action.type === 'delete') {
      postToIframe({ type: 'deleteBlock', id: action.id });
      setSessionChanges(sc => [...sc, { action: 'delete', label: action.label, preview: action.preview }]);
      setSelectedBlock(null);
    }
  };

  // Lock toggle
  const toggleLock = (block) => {
    const nextLocked = !block.locked;
    postToIframe({ type: 'setLock', id: block.id, locked: nextLocked });
    setBlocks(bs => bs.map(b => b.id === block.id ? { ...b, locked: nextLocked } : b));
  };

  // Keep the ref in sync with the latest blocks array so lookups inside the
  // message listener are always fresh.
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // Single selectBlock function shared by every call site — left-rail row
  // click, iframe preview click, keyboard nav, etc. Always opens the target
  // accordion (never toggles closed). Never requires two clicks.
  const selectBlock = useCallback((blockOrId) => {
    const id = typeof blockOrId === 'string' ? blockOrId : blockOrId?.id;
    if (!id) return;
    const block = blocksRef.current.find(b => b.id === id);
    if (!block) {
      console.warn('[comp-studio] selectBlock called for unknown id', id);
      return;
    }
    // Open Blocks section so the accordion row is visible.
    setOpenSections(p => (p.blocks ? p : { ...p, blocks: true }));
    // Switch the active block. If it's already the selected one we still
    // re-trigger the highlight + scroll so a second click still paints the
    // preview outline.
    setSelectedBlock(block);
    // Paint the amber outline in the preview.
    iframeRef.current?.contentWindow?.postMessage({ source: 'comp-studio-parent', type: 'highlight', id }, '*');
    // Scroll the left rail row into view after React has had a chance to
    // render the expanded accordion (use rAF → micro-delay).
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-block-row-id="${CSS.escape(id)}"]`);
      if (row && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  // Keep the ref in sync so the (empty-deps) message listener always invokes
  // the latest selectBlock implementation.
  useEffect(() => { selectBlockRef.current = selectBlock; }, [selectBlock]);

  // ─── Drafts ──────────────────────────────────────────────────────────────
  const serializeLiveHtml = () => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.documentElement) return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    return rawHtml;
  };

  const saveDraft = useCallback(async ({ silent = false } = {}) => {
    if (!rawHtml) return null;
    const html_content = serializeLiveHtml();
    const payload = {
      name: templateName || 'Untitled Comp',
      category,
      source_url: sourceUrl || null,
      html_content,
      session_changes: sessionChanges,
      strip_stats: stripStats,
    };
    try {
      const url = currentDraftId
        ? `/api/comp-studio/drafts/${currentDraftId}`
        : '/api/comp-studio/drafts';
      const res = await fetch(url, {
        method: currentDraftId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const id = data?.draft?.id || currentDraftId;
      if (id && id !== currentDraftId) setCurrentDraftId(id);
      setLastSavedAt(Date.now());
      setDirty(false);
      if (!firstAutoSaveDone) setFirstAutoSaveDone(true);
      if (!silent) setToast('Draft saved.');
      return id;
    } catch (err) {
      if (!silent) setToast('Save failed: ' + (err?.message || err));
      console.error('[comp-studio] save failed:', err);
      return null;
    }
  }, [rawHtml, templateName, category, sourceUrl, sessionChanges, stripStats, currentDraftId, firstAutoSaveDone]);

  // Mount-time draft verification
  useEffect(() => {
    if (!currentDraftId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/comp-studio/drafts/${currentDraftId}`, { credentials: 'include' });
        if (!cancelled) console.log('[comp-studio] draft verify', currentDraftId, res.status);
      } catch (e) {
        console.error('[comp-studio] draft verify failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentDraftId]);

  const loadDraft = useCallback(async (id, { skipConfirm = false } = {}) => {
    if (!skipConfirm && dirty && rawHtml) {
      if (!window.confirm('You have unsaved changes. Load this draft anyway?')) return;
    }
    try {
      const res = await fetch(`/api/comp-studio/drafts/${id}`, { credentials: 'include' });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      const cleaned = stripAndCleanWithStats(d.html_content || '');
      setRawHtml(cleaned.html);
      setIframeHtml(injectScript(cleaned.html));
      setStripStats(d.strip_stats?.scriptsRemoved != null
        ? d.strip_stats
        : { scriptsRemoved: cleaned.scriptsRemoved, adsPreserved: cleaned.adsPreserved });
      setSessionChanges(Array.isArray(d.session_changes) ? d.session_changes : []);
      setTemplateName(d.name || 'Untitled Comp');
      setCategory(d.category || 'general');
      setSourceUrl(d.source_url || '');
      setCurrentDraftId(d.id);
      setLastSavedAt((d.updated_at || 0) * 1000 || Date.now());
      setSelectedBlock(null);
      setDirty(false);
      setToast('Draft loaded.');
    } catch (err) {
      setToast('Load failed: ' + (err?.message || err));
    }
  }, [dirty, rawHtml]);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('draft');
      if (id) loadDraft(id, { skipConfirm: true });
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save
  useEffect(() => {
    if (!currentDraftId) return;
    const iv = setInterval(() => {
      if (dirty) saveDraft({ silent: true });
    }, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, [currentDraftId, dirty, saveDraft]);

  // First-completed comp auto-save after any text/image edit is logged.
  useEffect(() => {
    if (!firstAutoSaveDone && sessionChanges.length >= 1 && rawHtml) {
      saveDraft({ silent: true });
    }
  }, [sessionChanges, firstAutoSaveDone, rawHtml, saveDraft]);

  // ─── File upload / replace ────────────────────────────────────────────────
  const handleUpload = async (file) => {
    if (!file) return;
    const isHtml = /\.html?$/i.test(file.name) || file.type === 'text/html';
    if (!isHtml) { setToast('Only .html files are supported'); return; }
    // Large-file warning for SingleFile captures. Still loads the file — just
    // flags the user that block detection may slow down and surfaces a
    // compression hint for future captures.
    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > 5) {
      setToast(`Large file detected (${sizeMB.toFixed(1)}MB) — block detection may be slower. Consider using SingleFile's compression option for better performance.`);
    }
    setUploadedFileInfo({ name: file.name, bytes: file.size });
    setCleaning(true);
    try {
      let text = await file.text();
      if (fixRelative && sourceUrl) {
        try {
          const origin = new URL(sourceUrl).origin;
          text = text.replace(/(\b(?:src|href)=["'])\/(?!\/)/g, `$1${origin}/`);
        } catch {}
      }
      const { html, scriptsRemoved, adsPreserved } = stripAndCleanWithStats(text);
      setRawHtml(html);
      setIframeHtml(injectScript(html));
      setStripStats({ scriptsRemoved, adsPreserved });
      setSessionChanges([]);
      setSelectedBlock(null);
      setTemplateName(file.name.replace(/\.html?$/i, ''));
      if (sizeMB <= 5) {
        setToast(`HTML cleaned — ${scriptsRemoved} scripts removed, ${adsPreserved} ad placements preserved.`);
      }
    } catch (err) {
      setToast('Upload failed: ' + (err?.message || err));
    } finally {
      setCleaning(false);
    }
  };

  // ─── Master prompt ────────────────────────────────────────────────────────
  // Extract a short topic hint from the current page so the system prompt
  // can say "the page is about X and must remain about X". Uses the first
  // non-empty heading block as the source; falls back to the template name.
  function detectPageTopic() {
    const candidate = blocks.find(b => (b.type === 'heading' || b.type === 'header') && b.preview);
    const hint = (candidate?.preview || templateName || '').trim();
    return hint.slice(0, 120);
  }

  const runMasterPrompt = async () => {
    if (!masterPromptText.trim() || !rawHtml) return;
    const lockedIds = blocks.filter(b => b.locked).map(b => b.id);
    if (lockedIds.length === 0) {
      if (!window.confirm('You have no blocks locked. The master prompt will rewrite the entire page. Continue?')) return;
    }
    setMasterRunning(true);
    try {
      const lockedMap = await extractLocked(lockedIds);
      const stripped = await serializeStripped();
      const pageTopic = detectPageTopic();

      // Content-preservation instruction — the model was treating the whole
      // page as a blank canvas; now it's explicitly told to keep every
      // headline, paragraph, image reference, link, nav item, and article
      // intact, and to only change visual styling.
      const preservationRule =
        `You are redesigning an existing webpage. You MUST preserve ALL existing content — every headline, paragraph, image reference, link, navigation item, and article. Do not invent new content. Do not change the subject matter of the page. Do not replace real content with placeholder content. Only change visual styling — colors, typography, spacing, layout structure, and decorative elements.${pageTopic ? ` The page is about "${pageTopic}" and must remain about that topic.` : ''} If you cannot apply the requested style changes without changing the content, apply as much as possible while keeping all content intact.`;

      const res = await fetch('/api/comp-studio/master-prompt', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          templateName,
          styleDirection: masterPromptText,
          strippedHtml: stripped,
          lockedIds,
          pageTopic: pageTopic || undefined,
        }),
      });
      const data = await res.json();
      // Server-side errors (empty_response, invalid_html, locked_blocks_missing,
      // upstream_error) all return a well-typed error. Surface a specific toast
      // per code and LEAVE THE COMP UNTOUCHED — never blank the iframe.
      if (!res.ok || !data.html) {
        const code = data?.code || 'unknown';
        const msgByCode = {
          empty_response: 'AI returned empty response. Your comp is unchanged.',
          invalid_html: 'AI returned non-HTML content. Your comp is unchanged.',
          locked_blocks_missing: 'AI dropped your locked blocks. Your comp is unchanged.',
          upstream_error: 'AI service error. Your comp is unchanged.',
          no_direction: 'Enter a style direction first.',
          no_html: 'No HTML to restyle.',
          fetch_failed: 'Network error. Your comp is unchanged.',
        };
        console.error('[master-prompt] server rejected:', code, data);
        setToast(msgByCode[code] || `Master prompt failed (${code}). Your comp is unchanged.`);
        return;
      }

      let rewritten = String(data.html || '');
      if (data.warnings && data.warnings.length) {
        console.warn('[master-prompt] warnings:', data.warnings);
      }

      // Re-inject locked blocks in place of placeholders. If anything throws
      // (malformed placeholder match, regex quirk on a specific id), log it
      // and fall through to rendering the new HTML without the locked blocks
      // rather than rendering nothing.
      let reinjected = rewritten;
      try {
        Object.keys(lockedMap).forEach(id => {
          const safeId = String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const re = new RegExp(`\\[\\[LOCKED_BLOCK:${safeId}\\]\\]`, 'g');
          reinjected = reinjected.replace(re, lockedMap[id] || '');
        });
      } catch (lockErr) {
        console.error('[master-prompt] locked-block re-injection failed:', lockErr);
        reinjected = rewritten; // continue with the unlocked-free version
      }

      const { html } = stripAndCleanWithStats(reinjected);
      // One final guard — if stripAndClean nuked everything, abort.
      if (!html || html.length < 100) {
        console.error('[master-prompt] cleaned output was empty, aborting update');
        setToast('Master prompt produced no usable HTML — your comp is unchanged');
        return;
      }
      setRawHtml(html);
      setIframeHtml(injectScript(html));
      setSessionChanges(sc => [...sc, {
        action: 'text',
        label: 'Master Prompt',
        original: '(full page)',
        updated: `Global redesign — ${masterPromptText.slice(0, 50)}`,
      }]);
      setSelectedBlock(null);
      setToast('Master prompt applied.');
    } catch (err) {
      console.error('[master-prompt] threw:', err);
      setToast('Master prompt failed: ' + (err?.message || err));
    } finally {
      setMasterRunning(false);
    }
  };

  // ─── Replace All Copy ────────────────────────────────────────────────────
  const [copyMapping, setCopyMapping] = useState(null); // { blockIds: [], paragraphs: [], mapping: { blockId: paragraphIdx } }
  const handleCopyFile = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
      const textBlocks = blocks.filter(b => b.type === 'heading' || b.type === 'paragraph');
      const mapping = {};
      let idx = 0;
      for (const b of textBlocks) {
        if (idx < paragraphs.length) { mapping[b.id] = idx; idx++; }
      }
      setCopyMapping({ paragraphs, mapping, textBlocks });
    } catch (e) { setToast('Upload failed: ' + e.message); }
  };
  const applyCopyMapping = () => {
    if (!copyMapping) return;
    const { paragraphs, mapping, textBlocks } = copyMapping;
    textBlocks.forEach(b => {
      const i = mapping[b.id];
      if (typeof i === 'number' && paragraphs[i]) {
        postToIframe({ type: 'replaceText', id: b.id, text: paragraphs[i] });
        setSessionChanges(sc => [...sc, { action: 'text', label: b.name, updated: paragraphs[i] }]);
      }
    });
    setCopyMapping(null);
    setToast('Copy applied.');
  };

  // ─── Master ref image ──────────────────────────────────────────────────
  const handleMasterRef = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const mime = file.type || 'image/png';
      const b64 = btoa(Array.from(new Uint8Array(buf)).map(c => String.fromCharCode(c)).join(''));
      setMasterRef({ data: `data:${mime};base64,${b64}`, name: file.name });
    } catch (e) { setToast('Upload failed: ' + e.message); }
  };

  // ─── Export handlers ─────────────────────────────────────────────────────
  const downloadJpg = async (type) => {
    try {
      // Read the iframe DOM directly — postMessage-based serializeIframe()
      // has a 2s timeout that falls back to rawHtml on any hiccup, which
      // meant exports silently shipped the pre-edit HTML even after a save.
      const html = serializeLiveHtml();
      const res = await fetch('/api/comp-studio/export-jpg', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html_content: html, export_type: type }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${templateName}-${type}.jpg`;
      a.click(); URL.revokeObjectURL(url);
    } catch (err) { setToast('Export failed: ' + (err?.message || err)); }
  };
  const downloadHtml = async () => {
    try {
      const html = serializeLiveHtml();
      const safe = stripAndClean(html);
      const blob = new Blob([safe], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${templateName}-comp.html`;
      a.click(); URL.revokeObjectURL(url);
    } catch (err) { setToast('Download failed: ' + (err?.message || err)); }
  };

  const [includePrompt, setIncludePrompt] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportModalContent, setExportModalContent] = useState('');

  const llmRecreate = async () => {
    try {
      const html = await serializeIframe();
      const res = await fetch('/api/comp-studio/generate-copy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category, blockType: 'full-page', blockLabel: templateName,
          surroundingContext: html,
          userInstruction: 'Rewrite this entire HTML page as clean semantic HTML using modern CSS. Preserve all visual structure layout and content exactly. Remove all inline styles and replace with a clean embedded stylesheet. Use CSS custom properties for colors and typography.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed');
      let output = data.generated_text || '';
      if (includePrompt) {
        output = PROMPT_WRAPPERS.claudeCodeWrapper({
          templateName, category, description,
          r2Key: 'N/A (user comp)',
          sessionChanges, serializedHtml: output,
        });
      }
      setExportModalContent(output);
      setExportModalOpen(true);
    } catch (err) {
      setToast('Recreate failed: ' + (err?.message || err));
    }
  };

  // ─── Load drafts list ────────────────────────────────────────────────────
  const [draftsList, setDraftsList] = useState([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const openDraftsList = async () => {
    setLoadingDrafts(true);
    try {
      const r = await fetch('/api/comp-studio/drafts', { credentials: 'include' });
      const d = await r.json();
      setDraftsList(Array.isArray(d.drafts) ? d.drafts : []);
    } catch {}
    setLoadingDrafts(false);
  };

  if (!isDesktop) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', padding: 32,
      }}>
        <div className="card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
          <div className="eyebrow" style={{ marginBottom: 12 }}>✦ COMP STUDIO</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, marginBottom: 8 }}>Desktop only</h2>
          <p style={{ color: 'var(--text-mid)', fontSize: 14, lineHeight: 1.6 }}>
            Comp Studio is a precision design tool. Please open it on a screen 1024px or wider.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', height: 'calc(100vh - 48px)', background: 'var(--bg)' }}>
      {/* LEFT RAIL — accordion */}
      <aside style={{ borderRight: '1px solid var(--border-light)', background: 'var(--card)', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-light)' }}>
          <div className="eyebrow">✦ COMP STUDIO</div>
          <input
            className="form-input"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', marginTop: 6 }}
          />
        </div>

        <Section title="File" isOpen={openSections.file} onToggle={() => toggleSection('file')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="btn-secondary" style={{ justifyContent: 'center', cursor: 'pointer' }}>
              {cleaning ? 'Cleaning…' : rawHtml ? 'Replace HTML' : 'Upload HTML'}
              <input type="file" accept=".html,text/html" onChange={(e) => handleUpload(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            <label className="form-label" style={{ fontSize: 11 }}>Source URL (optional)</label>
            <input
              className="form-input"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/page"
              style={{ fontSize: 12, padding: '6px 10px' }}
            />
            <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-mid)' }}>
              <input type="checkbox" checked={fixRelative} onChange={(e) => setFixRelative(e.target.checked)} />
              Fix relative paths
            </label>
            {rawHtml && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <div className="status-badge status-badge--warning" style={{ fontSize: 10 }}>
                  {stripStats.scriptsRemoved} scripts removed
                </div>
                <div className="status-badge status-badge--success" style={{ fontSize: 10 }}>
                  {stripStats.adsPreserved} ad units preserved
                </div>
                {uploadedFileInfo && (
                  <div
                    className="status-badge"
                    style={{
                      fontSize: 10,
                      background: uploadedFileInfo.bytes > 5 * 1024 * 1024 ? 'var(--amber-light)' : 'var(--card-alt)',
                      color: uploadedFileInfo.bytes > 5 * 1024 * 1024 ? 'var(--amber-dim)' : 'var(--text-mid)',
                      border: '1px solid var(--border-light)', borderRadius: 100, padding: '2px 8px',
                    }}
                    title={uploadedFileInfo.name}
                  >
                    {(uploadedFileInfo.bytes / (1024 * 1024)).toFixed(1)}MB
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Master Prompt" isOpen={openSections.master} onToggle={() => toggleSection('master')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-mid)', lineHeight: 1.5 }}>
              Lock any blocks you want to preserve before running.
            </div>
            <textarea
              className="form-textarea"
              rows={4}
              placeholder="Example: Make this feel more premium and editorial. Dark background, serif fonts, amber accents."
              value={masterPromptText}
              onChange={(e) => setMasterPromptText(e.target.value)}
            />
            <label className="btn-secondary" style={{ justifyContent: 'center', cursor: 'pointer', fontSize: 11 }}>
              {masterRef ? `Ref: ${masterRef.name}` : 'Upload style reference (optional)'}
              <input type="file" accept="image/*" onChange={(e) => handleMasterRef(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
            <button className="btn-primary" onClick={runMasterPrompt} disabled={masterRunning || !masterPromptText.trim() || !rawHtml}>
              {masterRunning ? 'Running master prompt…' : 'Run Master Prompt'}
            </button>
          </div>
        </Section>

        <Section title="Viewport" isOpen={openSections.viewport} onToggle={() => toggleSection('viewport')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {VIEWPORTS.map(v => (
                <button key={v.id}
                  className={`db-btn ${viewport === v.id ? 'db-btn-accent' : ''}`}
                  onClick={() => setViewport(v.id)}
                  style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-light)' }}>
              <span>Zoom</span>
              <input type="range" min={50} max={100} step={5}
                value={Math.round(zoom * 100)}
                onChange={(e) => setZoom(parseInt(e.target.value, 10) / 100)}
                style={{ flex: 1 }} />
              <span style={{ width: 34, textAlign: 'right' }}>{Math.round(zoom * 100)}%</span>
            </div>
          </div>
        </Section>

        <Section title={`Blocks (${blocks.length})`} isOpen={openSections.blocks} onToggle={() => toggleSection('blocks')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blocks.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-light)', fontStyle: 'italic' }}>Upload an HTML comp to begin.</div>
            )}
            {blocks.map(b => (
              <BlockRow
                key={b.id}
                block={b}
                selected={selectedBlock}
                // Single click always opens the clicked block. Previously this
                // had toggle-off behavior (clicking the same row closed it)
                // which conflicted with preview-click switching.
                onSelect={(blk) => selectBlock(blk.id)}
                onToggleLock={toggleLock}
                onAction={handleBlockAction}
                category={category}
                rawHtml={rawHtml}
                setToast={setToast}
              />
            ))}

            {/* Replace All Copy */}
            {blocks.length > 0 && (
              <div style={{ marginTop: 12, padding: 10, background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
                <div className="eyebrow">REPLACE ALL COPY</div>
                <label className="btn-secondary" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', fontSize: 11, marginTop: 6 }}>
                  Upload .txt / .md / .docx
                  <input type="file" accept=".txt,.md,.docx,text/plain" onChange={(e) => handleCopyFile(e.target.files?.[0])} style={{ display: 'none' }} />
                </label>
                {copyMapping && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Mapping Preview</div>
                    <div style={{ maxHeight: 200, overflow: 'auto', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {copyMapping.textBlocks.map(b => {
                        const idx = copyMapping.mapping[b.id];
                        return (
                          <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 6, alignItems: 'center' }}>
                            <div style={{ color: 'var(--text-mid)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
                            <select
                              value={idx ?? ''}
                              onChange={(e) => setCopyMapping(cm => ({ ...cm, mapping: { ...cm.mapping, [b.id]: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } }))}
                              style={{ fontSize: 10, padding: 2 }}
                            >
                              <option value="">—</option>
                              {copyMapping.paragraphs.map((_, i) => <option key={i} value={i}>#{i + 1}</option>)}
                            </select>
                            <div style={{ color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {typeof idx === 'number' ? copyMapping.paragraphs[idx]?.slice(0, 40) + '…' : '(skip)'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="btn-accent" onClick={applyCopyMapping} style={{ fontSize: 11, padding: '4px 10px' }}>Apply</button>
                      <button className="btn-ghost" onClick={() => setCopyMapping(null)} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Draft" isOpen={openSections.draft} onToggle={() => toggleSection('draft')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn-primary" onClick={() => saveDraft()} disabled={!rawHtml}>Save Draft</button>
            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
              {lastSavedAt ? `Last saved ${formatRelative(lastSavedAt)}` : 'Not yet saved'}
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 11 }}>Load Draft</label>
              <select
                className="form-select"
                onFocus={openDraftsList}
                onChange={(e) => { if (e.target.value) loadDraft(e.target.value); }}
                value=""
                style={{ fontSize: 12 }}
              >
                <option value="">— pick a draft —</option>
                {loadingDrafts && <option disabled>Loading…</option>}
                {draftsList.map(d => (
                  <option key={d.id} value={d.id}>{d.name} · {d.category || 'general'}</option>
                ))}
              </select>
            </div>
            <label className="form-label" style={{ fontSize: 11 }}>Category</label>
            <select className="form-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="general">General</option>
              <option value="pages">Pages</option>
              <option value="components">Components</option>
              <option value="email">Email</option>
              <option value="landing">Landing</option>
            </select>
          </div>
        </Section>

        <Section title="Export" isOpen={openSections.export} onToggle={() => toggleSection('export')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn-primary" onClick={() => downloadJpg('full')} disabled={!rawHtml}>Export Full Page JPG</button>
            <button className="btn-outlined" onClick={() => { downloadJpg('mobile'); setTimeout(() => downloadJpg('social'), 300); setTimeout(() => downloadJpg('hero'), 600); }} disabled={!rawHtml}>
              Export Social Crops (3)
            </button>
            <button className="btn-primary" onClick={downloadHtml} disabled={!rawHtml}>Download HTML</button>
            <div style={{ padding: 8, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>LLM Recreate</div>
              <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-mid)' }}>
                <input type="checkbox" checked={includePrompt} onChange={(e) => setIncludePrompt(e.target.checked)} />
                Include Claude Code build prompt
              </label>
              <button className="btn-primary" onClick={llmRecreate} style={{ width: '100%', marginTop: 6, fontSize: 11, padding: '4px 10px' }} disabled={!rawHtml}>
                Recreate
              </button>
            </div>
          </div>
        </Section>

        <div style={{ padding: 10, fontSize: 10, color: 'var(--text-light)' }}>
          Session changes: {sessionChanges.length}
        </div>
      </aside>

      {/* CENTER CANVAS */}
      <CenterCanvas iframeHtml={iframeHtml} iframeRef={iframeRef} viewport={viewport} zoom={zoom} hasSelection={!!selectedBlock} />

      <Toast message={toast} onDone={() => setToast('')} />

      {exportModalOpen && (
        <ExportModal content={exportModalContent} onClose={() => setExportModalOpen(false)} setToast={setToast} />
      )}
    </div>
  );
}

// ─── Center canvas ─────────────────────────────────────────────────────────
function CenterCanvas({ iframeHtml, iframeRef, viewport, zoom, hasSelection }) {
  const vp = VIEWPORTS.find(v => v.id === viewport) || VIEWPORTS[0];
  const wrapperRef = useRef(null);
  const [available, setAvailable] = useState({ w: vp.w, h: 900 });

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const measure = () => {
      setAvailable({
        w: Math.max(200, el.clientWidth - 40),
        h: Math.max(300, el.clientHeight - 40),
      });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { if (ro) ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [viewport]);

  const autoFit = Math.min(1, available.w / vp.w);
  const scale = autoFit * zoom;
  const logicalH = Math.max(600, Math.round(available.h / scale));

  return (
    <div ref={wrapperRef} style={{
      padding: 20, overflow: 'hidden', background: 'var(--card-alt)', position: 'relative',
      borderLeft: hasSelection ? '3px solid var(--amber)' : '3px solid transparent',
      transition: 'border-color 0.15s',
    }}>
      {iframeHtml ? (
        <div style={{
          width: Math.round(vp.w * scale),
          height: Math.round(logicalH * scale),
          margin: '0 auto',
          overflow: 'hidden',
          background: 'var(--card)',
          boxShadow: 'var(--shadow-card)',
          borderRadius: 8,
        }}>
          <iframe
            ref={iframeRef}
            title="Comp Studio Preview"
            srcDoc={iframeHtml}
            sandbox="allow-same-origin allow-scripts"
            style={{
              width: vp.w,
              height: logicalH,
              border: 'none',
              display: 'block',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: 14 }}>
          Upload an HTML file in the File section to begin.
        </div>
      )}
    </div>
  );
}

// Re-exported for AdminTemplates.jsx (legacy import)
export function ExportModal({ content, onClose, setToast }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(content); setToast?.('Copied to clipboard'); }
    catch { setToast?.('Copy failed'); }
  };
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 720, padding: 18 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div className="eyebrow">EXPORT</div>
          <button className="btn-ghost" onClick={onClose}>Close</button>
        </div>
        <textarea
          value={content} readOnly
          style={{
            width: '100%', height: 420, fontFamily: 'var(--font-mono)', fontSize: 12,
            background: 'var(--surface-inp)', border: '1px solid var(--border)', borderRadius: 6, padding: 10,
          }}
        />
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button className="btn-primary" onClick={copy}>Copy to Clipboard</button>
        </div>
      </div>
    </div>
  );
}
