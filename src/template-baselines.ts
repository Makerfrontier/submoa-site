// Template baselines — 7 email templates + 9 presentation templates.
// AI fills placeholder tokens; the color panel swaps accents; uploading a
// custom file bypasses the baseline entirely (handled in the page code).

// ─── Luminance-derived text color helper ──────────────────────────────────
// Duplicated from content-utils.ts for contexts where that import isn't
// wired (edge workers, quick inline swaps). Keeps the formula in one place
// conceptually: L = 0.2126*R + 0.7152*G + 0.0722*B on linearized sRGB.
function parseHex(hex: string): { r: number; g: number; b: number } {
  const s = String(hex || '').replace(/^#/, '').trim();
  const h = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  const n = parseInt((h.slice(0, 6) || '000000'), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}
function linearize(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
export function textColorForBackground(hex: string): string {
  const { r, g, b } = parseHex(hex);
  const L = 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
  return L > 0.179 ? '#221A10' : '#FAF7F2';
}

// ─── Token replacement ────────────────────────────────────────────────────
// Replaces every {{TOKEN}} occurrence. Missing tokens fall through to the
// empty string so partially-populated outputs still render.
export function fillTokens(template: string, values: Record<string, string>): string {
  return String(template || '').replace(/\{\{([A-Z_0-9]+)\}\}/g, (_, key) => {
    return values[key] != null ? String(values[key]) : '';
  });
}

// ─── Email template types ─────────────────────────────────────────────────
export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  structure: string[];
  htmlBaseline: string;
}

// ─── Presentation template types ──────────────────────────────────────────
export interface SlideDefinition {
  slideType: 'title' | 'content' | 'split' | 'chart' | 'stats' | 'quote' | 'timeline' | 'closing' | 'agenda' | 'three-col' | 'two-col';
  layout: 'full' | 'split' | 'centered' | 'three-col' | 'two-col' | 'grid';
  placeholders: string[];
}
export interface PresentationTemplate {
  id: string;
  name: string;
  description: string;
  defaultSlideCount: number;
  accentColor: string;
  slides: SlideDefinition[];
}

// ─── Email HTML baselines ─────────────────────────────────────────────────
// Every baseline is table-based, inline-styled, max-width 600px. Placeholder
// tokens are wrapped in double braces and replaced by the pipeline before
// storage.

const EMAIL_NEWSLETTER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif;color:{{TEXT_COLOR}}">
<div style="display:none;max-height:0;overflow:hidden">{{SUBHEADLINE}}</div>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:{{BACKGROUND_COLOR}};padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1A1208;padding:0;height:200px;text-align:center;vertical-align:middle;color:#FAF7F2">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:{{ACCENT_COLOR}};padding-top:60px">Weekly Edition</div>
      <h1 style="margin:8px 16px 0;font-family:Georgia,serif;font-size:28px;color:#FAF7F2">{{HEADLINE}}</h1>
      <div style="font-size:14px;color:#CDC5B4;margin:6px 16px 0">{{SUBHEADLINE}}</div>
    </td></tr>
    <tr><td style="padding:24px 32px">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:{{TEXT_COLOR}}"><em>{{BODY_1}}</em></p>
      <hr style="border:none;border-top:1px solid #CDC5B4;margin:20px 0"/>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="50%" valign="top" style="padding-right:8px">
          <div style="background:#EDE8DF;height:100px;border-radius:4px"></div>
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};margin-top:8px">Feature</div>
          <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;margin-top:4px;color:{{TEXT_COLOR}}">{{ARTICLE_1_TITLE}}</div>
          <div style="font-size:13px;color:#6B5744;margin-top:4px;line-height:1.5">{{ARTICLE_1_EXCERPT}}</div>
          <a href="{{ARTICLE_1_URL}}" style="color:{{ACCENT_COLOR}};font-size:12px;text-decoration:none;font-weight:600">Read more →</a>
        </td>
        <td width="50%" valign="top" style="padding-left:8px">
          <div style="background:#EDE8DF;height:100px;border-radius:4px"></div>
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};margin-top:8px">Feature</div>
          <div style="font-family:Georgia,serif;font-size:16px;font-weight:600;margin-top:4px;color:{{TEXT_COLOR}}">{{ARTICLE_2_TITLE}}</div>
          <div style="font-size:13px;color:#6B5744;margin-top:4px;line-height:1.5">{{ARTICLE_2_EXCERPT}}</div>
          <a href="{{ARTICLE_2_URL}}" style="color:{{ACCENT_COLOR}};font-size:12px;text-decoration:none;font-weight:600">Read more →</a>
        </td>
      </tr></table>
      <div style="text-align:center;margin:28px 0 4px">
        <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#FAF7F2;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">{{CTA_TEXT}}</a>
      </div>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center">
      <div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div>
      <div>{{FOOTER_ADDRESS}}</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_ANNOUNCEMENT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:{{BACKGROUND_COLOR}};padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="background:{{ACCENT_COLOR}};height:3px"></td></tr>
    <tr><td style="padding:32px 32px 20px;text-align:left">
      <div style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:{{TEXT_COLOR}};letter-spacing:.04em">{{BRAND_NAME}}</div>
    </td></tr>
    <tr><td style="padding:0 32px 28px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:10px">Announcement</div>
      <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:30px;color:{{TEXT_COLOR}};line-height:1.15">{{HEADLINE}}</h1>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_1}}</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_2}}</p>
      <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#FAF7F2;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">{{CTA_TEXT}}</a>
      <hr style="border:none;border-top:1px solid #CDC5B4;margin:28px 0"/>
      <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:10px">What's New</div>
      <div style="display:block;margin-bottom:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px;vertical-align:middle"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_1}}</span></div>
      <div style="display:block;margin-bottom:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px;vertical-align:middle"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_2}}</span></div>
      <div style="display:block"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px;vertical-align:middle"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_3}}</span></div>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center">
      <div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_ROUNDUP_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="padding:24px 32px 12px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:{{TEXT_COLOR}}">{{BRAND_NAME}}</span>
      <span style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}}">Issue #{{ISSUE_NUMBER}}</span>
    </td></tr>
    <tr><td style="padding:12px 32px 20px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:10px">The Roundup</div>
      <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:28px;color:{{TEXT_COLOR}}">{{HEADLINE}}</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_1}}</p>
      <hr style="border:none;border-top:1px solid #CDC5B4;margin:12px 0"/>
      ${[1,2,3,4,5].map(i => `<div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #EAE4DC"><div style="font-family:Georgia,serif;font-size:36px;color:#CDC5B4;font-weight:700;line-height:1;min-width:40px">0${i}</div><div><div style="font-family:Georgia,serif;font-size:16px;font-weight:600;color:{{TEXT_COLOR}}">{{ITEM_${i}_TITLE}}</div><div style="font-size:13px;color:#6B5744;margin-top:4px;line-height:1.5">{{ITEM_${i}_EXCERPT}}</div><a href="{{ITEM_${i}_URL}}" style="color:{{ACCENT_COLOR}};font-size:12px;text-decoration:none;font-weight:600">Read more →</a></div></div>`).join('')}
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center"><div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div></td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_PROMOTIONAL_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1A1208;padding:48px 32px;text-align:center;color:#FAF7F2">
      <div style="display:inline-block;padding:4px 14px;background:rgba(184,135,46,0.18);color:{{ACCENT_COLOR}};border-radius:100px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:16px">Limited Time</div>
      <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:36px;color:#FAF7F2">{{HEADLINE}}</h1>
      <p style="margin:0 0 24px;font-size:16px;color:#CDC5B4">{{SUBHEADLINE}}</p>
      <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#1A1208;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:700;text-decoration:none">{{CTA_TEXT}}</a>
    </td></tr>
    <tr><td style="padding:28px 32px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
        <td width="50%" valign="top" style="padding-right:8px">
          <div style="background:#EDE8DF;height:120px;border-radius:4px"></div>
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};margin-top:8px">{{PRODUCT_1_CATEGORY}}</div>
          <div style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:{{TEXT_COLOR}}">{{PRODUCT_1_TITLE}}</div>
          <div style="font-size:13px;margin-top:4px"><strong style="color:{{ACCENT_COLOR}}">{{PRODUCT_1_PRICE}}</strong> <span style="color:#A09080;text-decoration:line-through">{{PRODUCT_1_ORIGINAL}}</span></div>
        </td>
        <td width="50%" valign="top" style="padding-left:8px">
          <div style="background:#EDE8DF;height:120px;border-radius:4px"></div>
          <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};margin-top:8px">{{PRODUCT_2_CATEGORY}}</div>
          <div style="font-family:Georgia,serif;font-size:15px;font-weight:600;color:{{TEXT_COLOR}}">{{PRODUCT_2_TITLE}}</div>
          <div style="font-size:13px;margin-top:4px"><strong style="color:{{ACCENT_COLOR}}">{{PRODUCT_2_PRICE}}</strong> <span style="color:#A09080;text-decoration:line-through">{{PRODUCT_2_ORIGINAL}}</span></div>
        </td>
      </tr></table>
      <p style="margin:20px 0 0;font-size:11px;color:#A09080;text-align:center">{{FINE_PRINT}}</p>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center"><div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div></td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_WELCOME_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="background:{{ACCENT_COLOR}};height:3px"></td></tr>
    <tr><td style="padding:32px 32px 24px;text-align:left"><div style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:{{TEXT_COLOR}}">{{BRAND_NAME}}</div></td></tr>
    <tr><td style="padding:12px 32px 32px;text-align:center">
      <div style="width:80px;height:80px;border-radius:50%;background:{{ACCENT_COLOR}};margin:0 auto 18px;display:inline-block"></div>
      <h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:28px;color:{{TEXT_COLOR}}">{{HEADLINE}}</h1>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_1}}</p>
      <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#FAF7F2;padding:12px 28px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">{{CTA_TEXT}}</a>
      <hr style="border:none;border-top:1px solid #CDC5B4;margin:28px 0"/>
      <div style="text-align:left">
        <div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:12px">What to expect</div>
        <div style="margin-bottom:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_1}}</span></div>
        <div style="margin-bottom:10px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_2}}</span></div>
        <div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{{ACCENT_COLOR}};margin-right:10px"></span><span style="font-size:14px;color:{{TEXT_COLOR}}">{{FEATURE_3}}</span></div>
      </div>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center"><div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div></td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_TRANSACTIONAL_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="padding:20px 32px 10px;border-bottom:1px solid #EAE4DC"><div style="font-family:Georgia,serif;font-size:13px;font-weight:700;color:{{TEXT_COLOR}}">{{BRAND_NAME}}</div></td></tr>
    <tr><td style="padding:24px 32px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:10px">{{EYEBROW}}</div>
      <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:24px;color:{{TEXT_COLOR}}">{{HEADLINE}}</h1>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_1}}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f2ed;border-radius:6px;margin-bottom:16px">
        <tr><td style="padding:14px 16px;border-bottom:1px solid #EAE4DC;font-size:13px;color:{{TEXT_COLOR}}"><strong>Item</strong><span style="float:right;color:#6B5744">{{ITEM_COST}}</span></td></tr>
        <tr><td style="padding:12px 16px;border-bottom:1px solid #EAE4DC;font-size:13px;color:#6B5744">Shipping<span style="float:right">{{SHIPPING_COST}}</span></td></tr>
        <tr><td style="padding:12px 16px;border-bottom:1px solid #EAE4DC;font-size:13px;color:#6B5744">Tax<span style="float:right">{{TAX_COST}}</span></td></tr>
        <tr><td style="padding:14px 16px;font-size:14px;color:{{TEXT_COLOR}};font-weight:700">Total<span style="float:right">{{TOTAL_COST}}</span></td></tr>
      </table>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_2}}</p>
      <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#FAF7F2;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">{{CTA_TEXT}}</a>
      <p style="margin:20px 0 0;font-size:11px;color:#A09080">This is a transactional message, not marketing. Questions? Reply to this email.</p>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center"><div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div></td></tr>
  </table>
</td></tr></table></body></html>`;

const EMAIL_REENGAGEMENT_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>{{HEADLINE}}</title></head><body style="margin:0;padding:0;background:{{BACKGROUND_COLOR}};font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="padding:24px 0"><tr><td align="center">
  <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FAF7F2;border-radius:8px;overflow:hidden">
    <tr><td style="background:{{ACCENT_COLOR}};height:3px"></td></tr>
    <tr><td style="padding:26px 32px 8px"><div style="font-family:Georgia,serif;font-size:14px;font-weight:700;color:{{TEXT_COLOR}}">{{BRAND_NAME}}</div></td></tr>
    <tr><td style="padding:10px 32px 28px">
      <div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:{{ACCENT_COLOR}};font-weight:700;margin-bottom:10px">We Miss You</div>
      <h1 style="margin:0 0 14px;font-family:Georgia,serif;font-size:30px;color:{{TEXT_COLOR}};line-height:1.2">{{HEADLINE}}</h1>
      <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_1}}</p>
      <blockquote style="margin:20px 0;padding:14px 18px;border-left:3px solid {{ACCENT_COLOR}};background:#F5EDD8;font-style:italic;font-family:Georgia,serif;font-size:15px;color:{{TEXT_COLOR}};line-height:1.5">{{PULL_QUOTE}}</blockquote>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:{{TEXT_COLOR}}">{{BODY_2}}</p>
      <a href="{{CTA_URL}}" style="display:inline-block;background:{{ACCENT_COLOR}};color:#FAF7F2;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;text-decoration:none">{{CTA_TEXT}}</a>
      <p style="margin:20px 0 0;font-size:11px;color:#A09080"><a href="{{UNSUBSCRIBE_URL}}" style="color:#A09080">Or unsubscribe if this isn't for you anymore</a></p>
    </td></tr>
    <tr><td style="background:#1A1208;padding:20px 32px;color:#CDC5B4;font-size:11px;text-align:center"><div style="color:#FAF7F2;font-weight:600;margin-bottom:6px">{{BRAND_NAME}}</div><div>{{FOOTER_ADDRESS}}</div></td></tr>
  </table>
</td></tr></table></body></html>`;

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
  newsletter: {
    id: 'newsletter', name: 'Newsletter',
    description: 'Weekly digest with hero image + 2-column article grid.',
    accentColor: '#B8872E',
    structure: ['hero', 'editor_note', 'divider', 'article_grid', 'cta', 'footer'],
    htmlBaseline: EMAIL_NEWSLETTER_HTML,
  },
  announcement: {
    id: 'announcement', name: 'Announcement',
    description: 'Product launch or major update with feature bullets.',
    accentColor: '#3D5A3E',
    structure: ['accent_bar', 'header', 'body', 'cta', 'divider', 'feature_list', 'footer'],
    htmlBaseline: EMAIL_ANNOUNCEMENT_HTML,
  },
  roundup_digest: {
    id: 'roundup_digest', name: 'Roundup Digest',
    description: 'Numbered list of 5 featured items with editorial intro.',
    accentColor: '#2A5A7A',
    structure: ['header', 'intro', 'divider', 'digest_list', 'footer'],
    htmlBaseline: EMAIL_ROUNDUP_HTML,
  },
  promotional: {
    id: 'promotional', name: 'Promotional',
    description: 'Dark hero block with offer + 2-column product grid.',
    accentColor: '#B8872E',
    structure: ['dark_hero', 'product_grid', 'fine_print', 'footer'],
    htmlBaseline: EMAIL_PROMOTIONAL_HTML,
  },
  welcome: {
    id: 'welcome', name: 'Welcome',
    description: 'Onboarding with circular avatar + 3-point expectations.',
    accentColor: '#6A4A8A',
    structure: ['accent_bar', 'header', 'avatar_welcome', 'cta', 'divider', 'expectations', 'footer'],
    htmlBaseline: EMAIL_WELCOME_HTML,
  },
  transactional: {
    id: 'transactional', name: 'Transactional',
    description: 'Order confirmation with itemized summary box.',
    accentColor: '#3D5A3E',
    structure: ['header', 'body', 'summary_box', 'body_close', 'cta', 'fine_print', 'footer'],
    htmlBaseline: EMAIL_TRANSACTIONAL_HTML,
  },
  reengagement: {
    id: 'reengagement', name: 'Reengagement',
    description: 'Win-back email with pull quote and unsubscribe link.',
    accentColor: '#B8872E',
    structure: ['accent_bar', 'header', 'body', 'pull_quote', 'body_close', 'cta', 'unsubscribe', 'footer'],
    htmlBaseline: EMAIL_REENGAGEMENT_HTML,
  },
};

// ─── Presentation slide sequences ─────────────────────────────────────────
// Each entry defines the structural backbone. The consumer generates content
// for each slide's placeholders via OpenRouter. `accentColor` applies to
// every accent bar/dot — overridden by the user's color panel when set.

export const PRESENTATION_TEMPLATES: Record<string, PresentationTemplate> = {
  executive_brief: {
    id: 'executive_brief', name: 'Executive Brief',
    description: '6-slide concise report for senior leadership.',
    defaultSlideCount: 6, accentColor: '#3D5A3E',
    slides: [
      { slideType: 'title',   layout: 'full',      placeholders: ['EYEBROW', 'TITLE', 'PRESENTER_LINE'] },
      { slideType: 'agenda',  layout: 'centered',  placeholders: ['AGENDA_1', 'AGENDA_2', 'AGENDA_3', 'AGENDA_4'] },
      { slideType: 'stats',   layout: 'three-col', placeholders: ['STAT_1_VALUE', 'STAT_1_LABEL', 'STAT_2_VALUE', 'STAT_2_LABEL', 'STAT_3_VALUE', 'STAT_3_LABEL'] },
      { slideType: 'content', layout: 'full',      placeholders: ['EYEBROW', 'TITLE', 'BODY'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'ACTION_1', 'ACTION_2', 'ACTION_3'] },
      { slideType: 'closing', layout: 'centered',  placeholders: ['CLOSING_TITLE', 'CLOSING_MESSAGE'] },
    ],
  },
  pitch_deck: {
    id: 'pitch_deck', name: 'Pitch Deck',
    description: '7-slide investor narrative: problem → solution → ask.',
    defaultSlideCount: 7, accentColor: '#B8872E',
    slides: [
      { slideType: 'title',     layout: 'split',      placeholders: ['TITLE', 'SUBTITLE', 'VISUAL_HINT'] },
      { slideType: 'content',   layout: 'full',       placeholders: ['TITLE', 'PROBLEM_STATEMENT'] },
      { slideType: 'content',   layout: 'full',       placeholders: ['TITLE', 'SOLUTION_STATEMENT'] },
      { slideType: 'three-col', layout: 'three-col',  placeholders: ['COL_1_TITLE', 'COL_1_BODY', 'COL_2_TITLE', 'COL_2_BODY', 'COL_3_TITLE', 'COL_3_BODY'] },
      { slideType: 'stats',     layout: 'three-col',  placeholders: ['STAT_1_VALUE', 'STAT_1_LABEL', 'STAT_2_VALUE', 'STAT_2_LABEL', 'STAT_3_VALUE', 'STAT_3_LABEL'] },
      { slideType: 'content',   layout: 'full',       placeholders: ['TITLE', 'TEAM_BLURB'] },
      { slideType: 'closing',   layout: 'centered',   placeholders: ['ASK_HEADLINE', 'ASK_DETAIL', 'CTA_1', 'CTA_2'] },
    ],
  },
  training_deck: {
    id: 'training_deck', name: 'Training Deck',
    description: '8-slide teaching module with agenda + knowledge check.',
    defaultSlideCount: 8, accentColor: '#2A5A7A',
    slides: [
      { slideType: 'title',   layout: 'full',      placeholders: ['MODULE_NUMBER', 'TITLE', 'SUBTITLE'] },
      { slideType: 'agenda',  layout: 'centered',  placeholders: ['AGENDA_1', 'AGENDA_2', 'AGENDA_3', 'AGENDA_4', 'AGENDA_5'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'BULLET_1', 'BULLET_2', 'BULLET_3'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'BULLET_1', 'BULLET_2', 'BULLET_3'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'BULLET_1', 'BULLET_2', 'BULLET_3'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'BULLET_1', 'BULLET_2', 'BULLET_3'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'QUESTION', 'CHOICE_A', 'CHOICE_B', 'CHOICE_C'] },
      { slideType: 'closing', layout: 'centered',  placeholders: ['TITLE', 'SUMMARY'] },
    ],
  },
  quarterly_roadmap: {
    id: 'quarterly_roadmap', name: 'Quarterly Roadmap',
    description: '6-slide timeline + metrics for quarterly planning.',
    defaultSlideCount: 6, accentColor: '#6A4A8A',
    slides: [
      { slideType: 'title',     layout: 'full',      placeholders: ['QUARTER', 'TITLE', 'SUBTITLE'] },
      { slideType: 'stats',     layout: 'three-col', placeholders: ['STAT_1_VALUE', 'STAT_1_LABEL', 'STAT_2_VALUE', 'STAT_2_LABEL', 'STAT_3_VALUE', 'STAT_3_LABEL'] },
      { slideType: 'timeline',  layout: 'full',      placeholders: ['MONTH_1_LABEL', 'MONTH_1_MILESTONE', 'MONTH_2_LABEL', 'MONTH_2_MILESTONE', 'MONTH_3_LABEL', 'MONTH_3_MILESTONE'] },
      { slideType: 'chart',     layout: 'full',      placeholders: ['TITLE', 'CHART_TITLE', 'CHART_SUBTITLE'] },
      { slideType: 'three-col', layout: 'three-col', placeholders: ['COL_1_TITLE', 'COL_1_BODY', 'COL_2_TITLE', 'COL_2_BODY', 'COL_3_TITLE', 'COL_3_BODY'] },
      { slideType: 'closing',   layout: 'centered',  placeholders: ['CLOSING_TITLE', 'CLOSING_MESSAGE'] },
    ],
  },
  sales_deck: {
    id: 'sales_deck', name: 'Sales Deck',
    description: '6-slide prospect pitch: pain → solution → proof → pricing.',
    defaultSlideCount: 6, accentColor: '#8B3A2A',
    slides: [
      { slideType: 'title',     layout: 'full',      placeholders: ['TITLE', 'SUBTITLE', 'CTA_1', 'CTA_2'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'PAIN_1', 'PAIN_2', 'PAIN_3'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'SOLUTION_BODY'] },
      { slideType: 'three-col', layout: 'three-col', placeholders: ['QUOTE_1', 'ATTRIB_1', 'QUOTE_2', 'ATTRIB_2', 'QUOTE_3', 'ATTRIB_3'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'PRICING_TIER_1', 'PRICING_TIER_2', 'PRICING_TIER_3'] },
      { slideType: 'closing',   layout: 'centered',  placeholders: ['CLOSING_TITLE', 'NEXT_STEP', 'CTA'] },
    ],
  },
  case_study: {
    id: 'case_study', name: 'Case Study',
    description: '7-slide client story: challenge → results → testimonial.',
    defaultSlideCount: 7, accentColor: '#3D5A3E',
    slides: [
      { slideType: 'title',   layout: 'full',      placeholders: ['CLIENT_EYEBROW', 'TITLE', 'SUBTITLE'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'CHALLENGE_BODY'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'APPROACH_BODY'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'IMPLEMENTATION_BODY'] },
      { slideType: 'stats',   layout: 'grid',      placeholders: ['METRIC_1_VALUE', 'METRIC_1_LABEL', 'METRIC_2_VALUE', 'METRIC_2_LABEL', 'METRIC_3_VALUE', 'METRIC_3_LABEL', 'METRIC_4_VALUE', 'METRIC_4_LABEL'] },
      { slideType: 'quote',   layout: 'centered',  placeholders: ['QUOTE', 'ATTRIBUTION'] },
      { slideType: 'closing', layout: 'centered',  placeholders: ['CLOSING_TITLE', 'CLOSING_MESSAGE'] },
    ],
  },
  company_overview: {
    id: 'company_overview', name: 'Company Overview',
    description: '6-slide brand introduction: mission → values → team.',
    defaultSlideCount: 6, accentColor: '#2A5A7A',
    slides: [
      { slideType: 'title',   layout: 'centered',  placeholders: ['COMPANY_NAME', 'TAGLINE'] },
      { slideType: 'content', layout: 'centered',  placeholders: ['TITLE', 'MISSION_STATEMENT'] },
      { slideType: 'content', layout: 'grid',      placeholders: ['VALUE_1_TITLE', 'VALUE_1_BODY', 'VALUE_2_TITLE', 'VALUE_2_BODY', 'VALUE_3_TITLE', 'VALUE_3_BODY', 'VALUE_4_TITLE', 'VALUE_4_BODY'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'TEAM_BODY'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'PRODUCT_OVERVIEW'] },
      { slideType: 'closing', layout: 'centered',  placeholders: ['CTA_HEADLINE', 'CTA_BODY'] },
    ],
  },
  rfp_response: {
    id: 'rfp_response', name: 'RFP Response',
    description: '7-slide proposal: understanding → approach → pricing → why us.',
    defaultSlideCount: 7, accentColor: '#B8872E',
    slides: [
      { slideType: 'title',     layout: 'full',      placeholders: ['TITLE', 'CLIENT', 'CONFIDENTIAL_NOTE'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'UNDERSTANDING_BODY'] },
      { slideType: 'three-col', layout: 'three-col', placeholders: ['STEP_1_TITLE', 'STEP_1_BODY', 'STEP_2_TITLE', 'STEP_2_BODY', 'STEP_3_TITLE', 'STEP_3_BODY'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'TEAM_BODY'] },
      { slideType: 'timeline',  layout: 'full',      placeholders: ['PHASE_1_LABEL', 'PHASE_1_DETAIL', 'PHASE_2_LABEL', 'PHASE_2_DETAIL', 'PHASE_3_LABEL', 'PHASE_3_DETAIL'] },
      { slideType: 'content',   layout: 'full',      placeholders: ['TITLE', 'PRICING_BODY'] },
      { slideType: 'closing',   layout: 'centered',  placeholders: ['WHY_US_HEADLINE', 'WHY_US_BODY'] },
    ],
  },
  submoa_signature: {
    id: 'submoa_signature', name: 'SubMoa Signature',
    description: '6-slide warm cream/leather editorial style with amber stat cards.',
    defaultSlideCount: 6, accentColor: '#B8872E',
    slides: [
      { slideType: 'title',   layout: 'full',      placeholders: ['TITLE', 'SUBTITLE'] },
      { slideType: 'agenda',  layout: 'centered',  placeholders: ['AGENDA_1', 'AGENDA_2', 'AGENDA_3', 'AGENDA_4'] },
      { slideType: 'stats',   layout: 'three-col', placeholders: ['STAT_1_VALUE', 'STAT_1_LABEL', 'STAT_1_CONTEXT', 'STAT_2_VALUE', 'STAT_2_LABEL', 'STAT_2_CONTEXT', 'STAT_3_VALUE', 'STAT_3_LABEL', 'STAT_3_CONTEXT'] },
      { slideType: 'quote',   layout: 'centered',  placeholders: ['QUOTE', 'ATTRIBUTION'] },
      { slideType: 'content', layout: 'full',      placeholders: ['TITLE', 'BODY', 'VISUAL_HINT'] },
      { slideType: 'closing', layout: 'full',      placeholders: ['CLOSING_TITLE', 'CLOSING_MESSAGE'] },
    ],
  },
};
