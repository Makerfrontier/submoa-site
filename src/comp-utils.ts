// SubMoa Comp Studio — shared utilities
// Used by both the user-facing CompStudio and the admin HTML Templates editor.

// ─── Ad network domain / global patterns ──────────────────────────────────
const AD_DOMAINS = [
  'googletagmanager.com',
  'googlesyndication.com',
  'doubleclick.net',
  'amazon-adsystem.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'securepubads.g.doubleclick.net',
  'prebid.org',
  'rubiconproject.com',
  'openx.net',
  'pubmatic.com',
  'appnexus.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'revcontent.com',
  'googletagservices.com',
];

const AD_GLOBALS = [
  'googletag.cmd',
  'googletag.pubads',
  'pbjs.',
  'apstag.',
  '__cmp(',
  '__tcfapi(',
  'adsbygoogle.push',
  'fbq(',
  '_fbq',
  'gtag(',
  'dataLayer.push',
  'hj(',
  '_hjSettings',
  'intercomSettings',
  'hsq.push',
  'analytics.track',
  'analytics.page',
  'mixpanel.track',
  'amplitude.getInstance',
];

// Substring signatures for src-less inline scripts (SingleFile / bundled captures
// that inline every ad-network library as plain text).
const AD_INLINE_SIGNATURES = [
  'googletag', 'gpt.js', 'openads', 'doubleclick', 'prebid',
  'adsbygoogle', 'amazon-adsystem', 'apstag', 'permutive', 'moatads',
  'criteo', 'taboola', 'outbrain', 'revcontent',
];

const ANALYTICS_REMNANTS = [
  '_gaq',
  'ga(',
  'analytics.js',
  'gtm.js',
  'hotjar',
  'clarity.ms',
  'mouseflow',
  'fullstory',
  'logrocket',
  'sentry.io',
];

const TRACKING_PATH_HINTS = ['pixel', 'beacon', 'track', 'impression'];

const IAB_SIZES: Record<string, string> = {
  '728x90': 'Leaderboard',
  '300x250': 'Medium Rectangle',
  '160x600': 'Wide Skyscraper',
  '300x600': 'Half Page',
  '320x50': 'Mobile Banner',
  '970x90': 'Billboard',
  '300x50': 'Mobile Banner Sm',
  '320x100': 'Large Mobile Banner',
  '970x250': 'Billboard Tall',
  '300x1050': 'Portrait',
};

const IAB_SIZE_LIST: Array<[number, number, string]> = [
  [728, 90,   'Leaderboard'],
  [300, 250,  'Medium Rectangle'],
  [160, 600,  'Wide Skyscraper'],
  [300, 600,  'Half Page'],
  [320, 50,   'Mobile Banner'],
  [970, 90,   'Billboard'],
  [300, 50,   'Mobile Banner Sm'],
  [320, 100,  'Large Mobile Banner'],
  [970, 250,  'Billboard Tall'],
  [300, 1050, 'Portrait'],
];

// Match measured (or declared) dimensions against IAB sizes within 30px tolerance.
// Returns { size: "WxH", label } when matched, null otherwise.
function matchIabSize(w: number, h: number): { size: string; label: string } | null {
  for (const [iw, ih, label] of IAB_SIZE_LIST) {
    if (Math.abs(w - iw) <= 30 && Math.abs(h - ih) <= 30) {
      return { size: `${iw}x${ih}`, label };
    }
  }
  return null;
}

export interface StripResult {
  html: string;
  scriptsRemoved: number;
  adsPreserved: number;
}

// stripAndClean runs on every HTML upload before storage or render.
// Returns cleaned HTML plus counts used for the user-facing toast.
export function stripAndClean(rawHtml: string): string {
  return stripAndCleanWithStats(rawHtml).html;
}

export function stripAndCleanWithStats(rawHtml: string): StripResult {
  if (typeof DOMParser === 'undefined') {
    return stripAndCleanRegex(rawHtml);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawHtml, 'text/html');
  let scriptsRemoved = 0;
  let adsPreserved = 0;

  const isAdScript = (s: HTMLScriptElement): boolean => {
    const src = (s.getAttribute('src') || '').toLowerCase();
    if (src && AD_DOMAINS.some(d => src.includes(d))) return true;
    const inline = s.textContent || '';
    if (inline && AD_GLOBALS.some(g => inline.includes(g))) return true;
    // SingleFile-style inline ad libs (no src attr, inlined as content).
    if (inline && !src) {
      const lc = inline.toLowerCase();
      if (AD_INLINE_SIGNATURES.some(sig => lc.includes(sig))) return true;
    }
    return false;
  };
  const isAnalyticsRemnant = (s: HTMLScriptElement): boolean => {
    const inline = s.textContent || '';
    const src = (s.getAttribute('src') || '').toLowerCase();
    return ANALYTICS_REMNANTS.some(r => inline.includes(r) || src.includes(r));
  };

  // Track parents of ad scripts so we can preserve their containers.
  const adContainerParents = new Set<Element>();

  // Step 1 — ad network scripts
  const allScripts = Array.from(doc.querySelectorAll('script'));
  for (const s of allScripts) {
    if (isAdScript(s)) {
      scriptsRemoved++;
      const parent = s.parentElement;
      if (parent && parent !== doc.body && parent !== doc.head) {
        adContainerParents.add(parent);
      }
      // Step 4 — remove immediate following noscript
      const next = s.nextElementSibling;
      if (next && next.tagName.toLowerCase() === 'noscript') next.remove();
      s.remove();
    }
  }

  // Step 2 — tracking pixels
  const imgs = Array.from(doc.querySelectorAll('img'));
  for (const img of imgs) {
    const w = parseInt(img.getAttribute('width') || '0', 10);
    const h = parseInt(img.getAttribute('height') || '0', 10);
    const src = (img.getAttribute('src') || '').toLowerCase();
    if ((w === 1 || h === 1) && (
      AD_DOMAINS.some(d => src.includes(d)) ||
      TRACKING_PATH_HINTS.some(p => src.includes(p))
    )) {
      img.remove();
    }
  }

  // Step 3 — ad iframes
  const iframes = Array.from(doc.querySelectorAll('iframe'));
  for (const f of iframes) {
    const src = (f.getAttribute('src') || '').toLowerCase();
    if (AD_DOMAINS.some(d => src.includes(d))) f.remove();
  }

  // Step 5 — preserve ad containers as clean placeholders.
  // Only convert elements whose *declared* dimensions match a known IAB size
  // within 30px tolerance. Class/id "ad" hints surface candidates but are not
  // sufficient on their own: a #wrapper-top-ad-1 that measures 1280x90 is not
  // an ad slot. Anything that doesn't match IAB is left untouched for the
  // runtime collect() pass to re-check against rendered dimensions.
  const candidates: Element[] = [];
  adContainerParents.forEach(el => candidates.push(el));
  // Secondary: surface class/id-hinted candidates but they still must pass the IAB gate.
  const classIdCandidates = Array.from(doc.querySelectorAll('div, ins, section')).filter(el => {
    const cls = (el.getAttribute('class') || '').toLowerCase();
    const id = (el.getAttribute('id') || '').toLowerCase();
    return /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(cls) ||
           /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(id);
  });
  for (const el of classIdCandidates) candidates.push(el);

  const seen = new Set<Element>();
  for (const el of candidates) {
    if (seen.has(el)) continue;
    seen.add(el);
    const dims = detectDimensions(el);
    if (!dims) continue;                               // Must have explicit dimensions.
    const match = matchIabSize(dims.w, dims.h);
    if (!match) continue;                              // Must match IAB within 30px.

    el.setAttribute('class', 'ad-placeholder');
    el.setAttribute('data-ad-size', match.size);
    el.setAttribute('data-ad-label', match.label);
    const [iw, ih] = match.size.split('x').map(n => parseInt(n, 10));
    el.setAttribute('style',
      `width:${iw}px;height:${ih}px;background:#e8e4dc;border:2px dashed #bbb;` +
      `display:flex;align-items:center;justify-content:center;` +
      `font-family:sans-serif;font-size:12px;color:#999;`
    );
    el.innerHTML = `Ad Placement — ${iw}×${ih} ${match.label}`;
    adsPreserved++;
  }

  // Step 6 — strip ALL remaining scripts. A visual comp doesn't need the page's
  // JavaScript to run, and leftover JS is a constant source of iframe
  // self-navigation (window.location = ...) that surfaces as DNS errors.
  const remainingScripts = Array.from(doc.querySelectorAll('script'));
  for (const s of remainingScripts) {
    if (isAnalyticsRemnant(s)) scriptsRemoved++;
    s.remove();
  }

  // Step 7 — neutralize srcdoc-hostile URLs so the preview iframe can render.
  // `<base>` tags and `//hostname/...` URLs both resolve against `about:srcdoc`
  // and produce bogus hostnames, which Firefox surfaces as DNS errors.
  Array.from(doc.querySelectorAll('base')).forEach(el => el.remove());
  Array.from(doc.querySelectorAll('meta[http-equiv="refresh"], meta[http-equiv="Refresh"]')).forEach(el => el.remove());
  const URL_ATTRS: Array<[string, string]> = [
    ['link', 'href'], ['script', 'src'], ['img', 'src'], ['a', 'href'],
    ['iframe', 'src'], ['video', 'src'], ['audio', 'src'], ['source', 'src'],
    ['form', 'action'], ['use', 'href'],
  ];
  for (const [tag, attr] of URL_ATTRS) {
    Array.from(doc.querySelectorAll(tag)).forEach(el => {
      const v = el.getAttribute(attr);
      if (!v) return;
      if (v.startsWith('//')) {
        el.setAttribute(attr, 'https:' + v);
      } else if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/|$)/i.test(v)) {
        // Schemeless URL like "www.example.com/path" — prepend https://
        el.setAttribute(attr, 'https://' + v);
      }
    });
  }
  // Also srcset (multiple URLs comma-separated)
  Array.from(doc.querySelectorAll('img[srcset], source[srcset]')).forEach(el => {
    const v = el.getAttribute('srcset');
    if (!v) return;
    const rewritten = v.split(',').map(part => {
      const trimmed = part.trim();
      if (trimmed.startsWith('//')) return 'https:' + trimmed;
      return trimmed;
    }).join(', ');
    el.setAttribute('srcset', rewritten);
  });
  // CSS url() in style attributes and <style> blocks
  Array.from(doc.querySelectorAll('[style]')).forEach(el => {
    const s = el.getAttribute('style') || '';
    const out = s.replace(/url\(\s*(['"]?)\/\//gi, 'url($1https://');
    if (out !== s) el.setAttribute('style', out);
  });
  Array.from(doc.querySelectorAll('style')).forEach(el => {
    const s = el.textContent || '';
    const out = s.replace(/url\(\s*(['"]?)\/\//gi, 'url($1https://');
    if (out !== s) el.textContent = out;
  });

  // Serialize back
  const html = doc.documentElement
    ? `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`
    : doc.body?.innerHTML || '';

  return { html, scriptsRemoved, adsPreserved };
}

function detectDimensions(el: Element): { w: number; h: number } | null {
  const style = el.getAttribute('style') || '';
  const wStyle = style.match(/width\s*:\s*(\d+)px/i);
  const hStyle = style.match(/height\s*:\s*(\d+)px/i);
  if (wStyle && hStyle) return { w: parseInt(wStyle[1], 10), h: parseInt(hStyle[1], 10) };

  const wAttr = el.getAttribute('width');
  const hAttr = el.getAttribute('height');
  if (wAttr && hAttr && /^\d+$/.test(wAttr) && /^\d+$/.test(hAttr)) {
    return { w: parseInt(wAttr, 10), h: parseInt(hAttr, 10) };
  }

  // Try to infer from class-based size hints like "ad-728x90" or "ad_300x250"
  const cls = el.getAttribute('class') || '';
  const m = cls.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
  if (m) return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };

  return null;
}

// Regex fallback for environments without DOMParser (e.g. Workers runtime).
function stripAndCleanRegex(rawHtml: string): StripResult {
  let html = rawHtml;
  let scriptsRemoved = 0;
  let adsPreserved = 0;

  // Collect ad script parents hinted by context — regex can't do parent tracking
  // reliably so we fall back to class/id hints only for step 5.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (match) => {
    const srcMatch = match.match(/src\s*=\s*["']([^"']+)["']/i);
    const src = srcMatch ? srcMatch[1].toLowerCase() : '';
    const body = match.replace(/<script\b[^>]*>|<\/script>/gi, '');
    const bodyLc = body.toLowerCase();
    const hit =
      (src && AD_DOMAINS.some(d => src.includes(d))) ||
      AD_GLOBALS.some(g => body.includes(g)) ||
      (!src && AD_INLINE_SIGNATURES.some(sig => bodyLc.includes(sig))) ||
      ANALYTICS_REMNANTS.some(r => body.includes(r) || src.includes(r));
    if (hit) scriptsRemoved++;
    // Strip ALL scripts — comp preview doesn't need page JS and leftover JS
    // is a reliable source of iframe self-navigation and DNS errors.
    return '';
  });

  // Tracking pixels
  html = html.replace(/<img\b[^>]*>/gi, (match) => {
    const wM = match.match(/\bwidth\s*=\s*["']?(\d+)/i);
    const hM = match.match(/\bheight\s*=\s*["']?(\d+)/i);
    const sM = match.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const w = wM ? parseInt(wM[1], 10) : 0;
    const h = hM ? parseInt(hM[1], 10) : 0;
    const src = sM ? sM[1].toLowerCase() : '';
    if ((w === 1 || h === 1) && (
      AD_DOMAINS.some(d => src.includes(d)) ||
      TRACKING_PATH_HINTS.some(p => src.includes(p))
    )) {
      return '';
    }
    return match;
  });

  // Ad iframes
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (match) => {
    const sM = match.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const src = sM ? sM[1].toLowerCase() : '';
    if (AD_DOMAINS.some(d => src.includes(d))) return '';
    return match;
  });

  // Orphan noscripts are hard to resolve in regex mode — leave them.

  // Strip <base> and meta-refresh, rewrite //-URLs and CSS url() to https://
  html = html.replace(/<base\b[^>]*\/?>/gi, '');
  html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*\/?>/gi, '');
  html = html.replace(/(<(?:link|script|img|a|iframe|video|audio|source|use|form)\b[^>]*?\s(?:href|src|action|srcset)\s*=\s*)(["'])\/\//gi, '$1$2https://');
  html = html.replace(/url\(\s*(['"]?)\/\//gi, 'url($1https://');

  // Preserve ad containers — ONLY if detected dimensions match an IAB size
  // within 30px tolerance. Class/id "ad" hints surface candidates, but the
  // dimension gate is what decides. Elements that don't match IAB are left
  // alone for the runtime collect() pass to classify.
  html = html.replace(
    /<(div|ins|section)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    (match, _tag, attrs) => {
      const cls = (attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
      const id = (attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase();
      const hasHint =
        /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(cls) ||
        /\b(ads?|adunit|ad-unit|advertisement|banner)\b/.test(id);
      if (!hasHint) return match;

      const style = (attrs.match(/\bstyle\s*=\s*["']([^"']+)["']/i)?.[1] || '');
      const wS = style.match(/width\s*:\s*(\d+)px/i);
      const hS = style.match(/height\s*:\s*(\d+)px/i);
      const sizeFromClass = cls.match(/(\d{2,4})\s*x\s*(\d{2,4})/i);
      const w = wS ? parseInt(wS[1], 10) : sizeFromClass ? parseInt(sizeFromClass[1], 10) : NaN;
      const h = hS ? parseInt(hS[1], 10) : sizeFromClass ? parseInt(sizeFromClass[2], 10) : NaN;
      if (!Number.isFinite(w) || !Number.isFinite(h)) return match;
      const matchIab = matchIabSize(w, h);
      if (!matchIab) return match;

      const [iw, ih] = matchIab.size.split('x').map(n => parseInt(n, 10));
      adsPreserved++;
      return `<div class="ad-placeholder" data-ad-size="${matchIab.size}" data-ad-label="${matchIab.label}" style="width:${iw}px;height:${ih}px;background:#e8e4dc;border:2px dashed #bbb;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:12px;color:#999;">Ad Placement — ${iw}×${ih} ${matchIab.label}</div>`;
    }
  );

  return { html, scriptsRemoved, adsPreserved };
}

// ─── Prompt wrappers ──────────────────────────────────────────────────────
// Every prompt sent to a model passes through one of these wrappers. User
// instruction strings are never concatenated raw into the model input.

export interface CopyWrapperArgs {
  category: string;
  blockType: string;
  blockLabel: string;
  surroundingContext: string;
  userInstruction: string;
}

export interface ImagePromptWrapperArgs {
  category: string;
  adSize: string;
  adLabel: string;
  userDirection: string;
}

export interface SessionChange {
  action: 'delete' | 'text' | 'image' | 'ad';
  label?: string;
  preview?: string;
  original?: string;
  updated?: string;
  dimensions?: string;
  adLabel?: string;
  adSize?: string;
  method?: string;
}

export interface ClaudeCodeWrapperArgs {
  templateName: string;
  category: string;
  description: string;
  r2Key: string;
  sessionChanges: SessionChange[];
  serializedHtml: string;
}

export const PROMPT_WRAPPERS = {
  copyWrapper({ category, blockType, blockLabel, surroundingContext, userInstruction }: CopyWrapperArgs) {
    return [
      {
        role: 'system',
        content:
          `You are an editorial copywriter working inside a professional web design tool. ` +
          `You are helping a user edit a ${category} webpage. ` +
          `Your output will be injected directly into a live webpage visible to the public. ` +
          `CONSTRAINTS: No fabricated statistics, citations, or factual claims you cannot verify. ` +
          `No defamatory content about real people or organizations. ` +
          `No impersonation of real brands or public figures. ` +
          `No deceptive, misleading, or manipulative content. ` +
          `No content that violates copyright. ` +
          `Output must be appropriate for a ${category} context. ` +
          `Match the tone and register of the surrounding content.`,
      },
      {
        role: 'user',
        content:
          `Block type: ${blockType}. Block label: ${blockLabel}. ` +
          `Surrounding context: ${surroundingContext}. ` +
          `Instruction: ${userInstruction}. ` +
          `Return only the replacement text. No preamble, no explanation, no quotes around the output.`,
      },
    ];
  },

  imagePromptWrapper({ category, adSize, adLabel, userDirection }: ImagePromptWrapperArgs) {
    return [
      {
        role: 'system',
        content:
          `You are a creative director writing image generation prompts for a professional web design tool. ` +
          `Your prompt will be sent to an AI image model. ` +
          `The output image will be displayed on a live webpage. ` +
          `CONSTRAINTS: No faces. No people. No readable text. No logos or brand marks. ` +
          `No content that could be defamatory, misleading, or inappropriate for a professional website. ` +
          `No photography style — graphic design aesthetic only. ` +
          `No purple gradients, no lens flare, no HDR, no stock photo look. No uncanny valley.`,
      },
      {
        role: 'user',
        content:
          `Generate an image prompt for an ad placement of size ${adSize} (${adLabel}). ` +
          `This is for a ${category} webpage. ` +
          `The image must fill exactly ${adSize} pixels and be optimized for immediate visual impact at that size. ` +
          `Style direction from user: ${userDirection}. ` +
          `Return a single image generation prompt string only. No explanation, no preamble, no quotes.`,
      },
    ];
  },

  claudeCodeWrapper({ templateName, category, description, r2Key, sessionChanges, serializedHtml }: ClaudeCodeWrapperArgs): string {
    const changesBlock = sessionChanges.length === 0
      ? 'No tracked changes — full HTML provided for reference.'
      : sessionChanges.map(c => {
          if (c.action === 'delete') return `Remove: ${c.label} — "${c.preview}"`;
          if (c.action === 'text') return `Update ${c.label} — from: "${c.original}" to: "${c.updated}"`;
          if (c.action === 'image') return `Replace image in ${c.label} — ${c.dimensions}`;
          if (c.action === 'ad') return `Replace ad unit ${c.adLabel} ${c.adSize} — ${c.method}`;
          return '';
        }).join('\n');

    return (
      'Read src/App.jsx and src/index.css in full. Do not touch anything until you have read both files.\n\n' +
      'SECURITY NOTE: This prompt was generated by the SubMoa Comp Studio. ' +
      'Only apply the changes listed below. Do not modify any files not mentioned. ' +
      'Do not alter environment variables, secrets, or authentication logic. ' +
      'Scope all changes to existing component structure.\n\n' +
      'TEMPLATE CONTEXT:\n' +
      `Name: ${templateName}\n` +
      `Category: ${category}\n` +
      `Description: ${description}\n` +
      `R2 key: ${r2Key}\n\n` +
      'CHANGES MADE IN EDITOR:\n' +
      changesBlock + '\n\n' +
      'CURRENT HTML STATE:\n' +
      '```html\n' +
      serializedHtml + '\n' +
      '```\n\n' +
      'INSTRUCTIONS: Apply each listed change to the relevant source files in src/App.jsx or src/pages/ ' +
      'matching the SubMoa design system tokens exactly. Do not edit the R2 template file — edit source files only. ' +
      'Run npm run build confirming zero errors then run npm run deploy.'
    );
  },
};
