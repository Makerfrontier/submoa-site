// src/email-assembler.ts
// Email template assembler — runs in queue consumer when article_format === 'email'.
//
// Pipeline:
//   1. Fetch writing skill + author voice
//   2. Generate copy via Claude (OpenRouter) → structured JSON
//   3. Derive a full color palette from the user's primary + secondary
//   4. Render bulletproof, table-based, inline-CSS email HTML (≤ 100 KB)
//   5. Render plain-text fallback
//   6. Write both to projects/{id}/email/ and update DB status
//   7. Optional API push (SendGrid / AWeber)

import { writeProjectFile } from "./project-template";

interface Env {
  DB?: D1Database;
  submoacontent_db?: D1Database;
  SUBMOA_IMAGES: R2Bucket;
  OPENROUTER_API_KEY: string;
  AWEBER_API_KEY?: string;
}

// Pick whichever D1 binding the runtime exposes (consumer uses DB; Pages uses submoacontent_db)
function db(env: Env): D1Database {
  const x = env.submoacontent_db ?? env.DB;
  if (!x) throw new Error("[email-assembler] No D1 binding available");
  return x;
}

const CLAUDE_MODEL = "anthropic/claude-sonnet-4";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------
export interface EmailRecord {
  id: string;
  submission_id: string;
  template_type: string;       // newsletter | transactional | marketing
  template_name: string;
  subject_line: string;
  preheader_text: string | null;
  brand_name: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  brand_voice: string | null;
  logo_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  unsubscribe_url: string | null;
  company_address: string | null;
  sections: string | null;     // JSON
  sendgrid_api_key: string | null;
  aweber_account: string | null;
  api_push_enabled: number;
  api_push_service: string | null;
  email_status: string | null;
}

interface EmailSubmissionContext {
  id: string;
  topic: string;
  author: string | null;
  author_display_name?: string | null;
  style_guide?: string | null;
}

interface SectionInput { title: string; brief: string }

interface EmailContent {
  subject: string;
  preheader: string;
  headline: string;
  intro: string;
  sections: Array<{ title: string; body: string; cta_text?: string; cta_url?: string }>;
  closing: string;
  cta_text: string;
  cta_url: string;
  plain_text: string;
}

interface Palette {
  header_bg: string;
  header_text: string;
  cta_bg: string;
  cta_text: string;
  cta_hover: string;
  body_bg: string;
  body_text: string;
  footer_bg: string;
  footer_text: string;
  divider_color: string;
  accent_color: string;
  muted_text: string;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------
export async function assembleEmail(
  env: Env,
  submission: EmailSubmissionContext,
  emailRecord: EmailRecord
): Promise<void> {
  try {
    await updateEmailStatus(env, emailRecord.id, "rendering");

    // 1. Writing skill
    const skill = await getWritingSkill(env);

    // 2. Author voice (best effort)
    let author: { name: string | null; style_guide: string | null } | null = null;
    if (submission.author) {
      author = await db(env).prepare(
        "SELECT name, style_guide FROM author_profiles WHERE slug = ?"
      ).bind(submission.author).first<{ name: string | null; style_guide: string | null }>().catch(() => null);
    }

    // 3. Sections
    const sections: SectionInput[] = emailRecord.sections
      ? safeJson<SectionInput[]>(emailRecord.sections) ?? []
      : [];

    // 4. Palette
    const palette = deriveColorPalette(
      emailRecord.primary_color || "#c8973a",
      emailRecord.secondary_color || "#1e3a1e"
    );

    // 5. Generate content
    const content = await generateEmailContent(env, submission, emailRecord, author, skill, sections);

    // 6 + 7. Build outputs
    const html = buildEmailHtml(content, emailRecord, palette);
    const txt = buildEmailTxt(content, emailRecord);

    // 8. Write to project folder
    await writeProjectFile(env as any, submission.id, "email", "email.html", html, "text/html");
    await writeProjectFile(env as any, submission.id, "email", "email.txt", txt, "text/plain; charset=utf-8");

    // 9. Mark ready
    const now = Date.now();
    await db(env).prepare(
      `UPDATE email_submissions
         SET email_status = ?, html_r2_key = ?, txt_r2_key = ?, assembled_at = ?
       WHERE id = ?`
    ).bind(
      "ready",
      `projects/${submission.id}/email/email.html`,
      `projects/${submission.id}/email/email.txt`,
      now,
      emailRecord.id
    ).run();

    // Mark the parent submission complete (skip the standard generation pipeline)
    await db(env).prepare(
      "UPDATE submissions SET status = ?, grade_status = ?, updated_at = ? WHERE id = ?"
    ).bind("article_done", "graded", now, submission.id).run();

    // 10. Optional API push
    if (emailRecord.api_push_enabled && emailRecord.api_push_service) {
      await pushToEmailService(env, emailRecord, html, txt, content.subject)
        .catch((err) => console.error("[email-assembler] API push failed:", err));
    }

    console.log(`[email-assembler] Built email for submission ${submission.id}`);
  } catch (err: any) {
    console.error("[email-assembler] Assembly error:", err?.message ?? err);
    await updateEmailStatus(env, emailRecord.id, "failed").catch(() => {});
    await db(env).prepare(
      "UPDATE submissions SET status = ?, updated_at = ? WHERE id = ?"
    ).bind("failed", Date.now(), submission.id).run().catch(() => {});
  }
}

async function updateEmailStatus(env: Env, id: string, status: string): Promise<void> {
  await db(env).prepare(
    "UPDATE email_submissions SET email_status = ? WHERE id = ?"
  ).bind(status, id).run();
}

async function getWritingSkill(env: Env): Promise<string> {
  const row = await db(env).prepare(
    "SELECT content FROM agent_skills WHERE name = 'writing-skill' AND active = 1 LIMIT 1"
  ).first<{ content: string }>().catch(() => null);
  return row?.content ?? "Write clear, scannable, professional copy with a strong hook and a single clear next action.";
}

// ---------------------------------------------------------------------------
// Color palette derivation
// ---------------------------------------------------------------------------
export function deriveColorPalette(primary: string, secondary: string): Palette {
  const p = parseHex(primary) ?? { r: 200, g: 151, b: 58 };
  const s = parseHex(secondary) ?? { r: 30, g: 58, b: 30 };
  const pHsl = rgbToHsl(p);
  const sHsl = rgbToHsl(s);
  const pLum = relativeLuminance(p);
  const sLum = relativeLuminance(s);

  // body_bg: secondary lightened to ≥ 90% L
  const bodyHsl = { h: sHsl.h, s: Math.max(0, sHsl.s - 40), l: Math.max(95, sHsl.l) };
  const bodyBg = rgbToHex(hslToRgb(bodyHsl));

  // cta_hover: primary darkened by 15%
  const ctaHover = rgbToHex(hslToRgb({ h: pHsl.h, s: pHsl.s, l: Math.max(0, pHsl.l - 15) }));

  // accent: complementary hue, same saturation, 60% L
  const accent = rgbToHex(hslToRgb({ h: (pHsl.h + 180) % 360, s: pHsl.s, l: 60 }));

  // divider: secondary at 30% over white
  const divider = rgbToHex({
    r: Math.round(s.r * 0.3 + 255 * 0.7),
    g: Math.round(s.g * 0.3 + 255 * 0.7),
    b: Math.round(s.b * 0.3 + 255 * 0.7),
  });

  // muted_text: body_text at 60% over body_bg
  const bodyBgRgb = hslToRgb(bodyHsl);
  const muted = rgbToHex({
    r: Math.round(0x33 * 0.6 + bodyBgRgb.r * 0.4),
    g: Math.round(0x33 * 0.6 + bodyBgRgb.g * 0.4),
    b: Math.round(0x33 * 0.6 + bodyBgRgb.b * 0.4),
  });

  const headerText = pLum > 0.5 ? "#000000" : "#ffffff";
  const ctaText = pLum > 0.5 ? "#000000" : "#ffffff";
  const footerText = sLum > 0.5 ? "#333333" : "#cccccc";

  return {
    header_bg: normHex(primary),
    header_text: headerText,
    cta_bg: normHex(primary),
    cta_text: ctaText,
    cta_hover: ctaHover,
    body_bg: bodyBg,
    body_text: "#333333",
    footer_bg: normHex(secondary),
    footer_text: footerText,
    divider_color: divider,
    accent_color: accent,
    muted_text: muted,
  };
}

// ---------------------------------------------------------------------------
// Claude content generation
// ---------------------------------------------------------------------------
async function generateEmailContent(
  env: Env,
  submission: EmailSubmissionContext,
  emailRecord: EmailRecord,
  author: { name: string | null; style_guide: string | null } | null,
  skill: string,
  sections: SectionInput[]
): Promise<EmailContent> {
  const sectionList = sections.length
    ? sections.map((s, i) => `${i + 1}. ${s.title} — ${s.brief}`).join("\n")
    : "(no sections — use intro/closing only)";

  const prompt = `You are an expert email copywriter.

WRITING SKILL:
${skill}

AUTHOR VOICE:
${author?.style_guide || "Write in a clear, engaging, professional style."}

TEMPLATE TYPE: ${emailRecord.template_type}
BRAND NAME: ${emailRecord.brand_name || "(unspecified)"}
BRAND VOICE: ${emailRecord.brand_voice || "not specified"}
SUBJECT LINE: ${emailRecord.subject_line}
CONTENT BRIEF: ${submission.topic}
SECTIONS:
${sectionList}
CTA: ${emailRecord.cta_text || ""} → ${emailRecord.cta_url || ""}

Write the email content. Return ONLY valid JSON, no prose, no markdown:
{
  "subject": "final subject line, can refine the provided one, under 60 chars",
  "preheader": "preview text under 90 chars",
  "headline": "email headline (different from subject, grabs attention)",
  "intro": "2-3 sentence opening paragraph",
  "sections": [
    { "title": "...", "body": "...", "cta_text": "optional", "cta_url": "optional" }
  ],
  "closing": "1-2 sentence closing",
  "cta_text": "main CTA button text",
  "cta_url": "main CTA URL",
  "plain_text": "full plain-text version of the email"
}

Rules:
- No em dashes, no ellipses, no AI-tell phrases
- Subject under 60 chars, preheader under 90 chars
- All copy follows the author voice
- Body text is scannable — short paragraphs, no walls of text
- CTA button text: action verb first, under 5 words`;

  const text = await callClaude(env, prompt, 2500);
  const parsed = safeJson<EmailContent>(text);
  if (!parsed) {
    console.error("[email-assembler] Claude returned invalid JSON. First 400 chars:", text.slice(0, 400));
    return fallbackContent(emailRecord, submission, sections);
  }

  // Light backfill / sanitization
  parsed.subject = (parsed.subject || emailRecord.subject_line || submission.topic).slice(0, 80);
  parsed.preheader = (parsed.preheader || emailRecord.preheader_text || "").slice(0, 110);
  parsed.headline = (parsed.headline || parsed.subject).trim();
  parsed.intro = (parsed.intro || "").trim();
  parsed.closing = (parsed.closing || "").trim();
  parsed.cta_text = (parsed.cta_text || emailRecord.cta_text || "Learn more").slice(0, 40);
  parsed.cta_url = parsed.cta_url || emailRecord.cta_url || "#";
  parsed.sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  parsed.plain_text = parsed.plain_text || "";
  return parsed;
}

function fallbackContent(emailRecord: EmailRecord, submission: EmailSubmissionContext, sections: SectionInput[]): EmailContent {
  return {
    subject: emailRecord.subject_line || submission.topic,
    preheader: (emailRecord.preheader_text || "").slice(0, 110),
    headline: emailRecord.subject_line || submission.topic,
    intro: submission.topic,
    sections: sections.map((s) => ({ title: s.title, body: s.brief })),
    closing: "",
    cta_text: emailRecord.cta_text || "Learn more",
    cta_url: emailRecord.cta_url || "#",
    plain_text: "",
  };
}

// ---------------------------------------------------------------------------
// HTML builder — bulletproof, table-based, inline CSS
// ---------------------------------------------------------------------------
export function buildEmailHtml(content: EmailContent, e: EmailRecord, p: Palette): string {
  const headFont = `Georgia, "Times New Roman", serif`;
  const bodyFont = `Arial, Helvetica, sans-serif`;

  const preheaderSpacers = "&nbsp;&zwnj;".repeat(60);
  const logoBlock = e.logo_url
    ? `<img src="${escapeAttr(e.logo_url)}" alt="${escapeAttr(e.brand_name || "logo")}" width="160" height="40" style="display:block; border:0; height:auto; max-height:50px; margin:0 auto 10px;" />`
    : "";

  const sectionsHtml = (content.sections || []).map((s, i) => {
    const altBg = i % 2 === 0 ? p.body_bg : lightenIfClose(p.body_bg);
    const sectCta = s.cta_text && s.cta_url
      ? `<tr><td align="center" style="padding:14px 24px 0 24px;">${button(p, s.cta_text, s.cta_url, bodyFont)}</td></tr>`
      : "";
    return `
              <tr>
                <td bgcolor="${altBg}" style="background-color:${altBg}; padding:18px 24px;">
                  <h2 style="margin:0 0 8px 0; font-family:${headFont}; font-size:20px; line-height:1.3; color:${p.body_text};">${escapeHtml(s.title)}</h2>
                  <p style="margin:0; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${p.body_text};">${nl2br(escapeHtml(s.body))}</p>
                </td>
              </tr>
              ${sectCta}`;
  }).join("");

  const ctaBlock = content.cta_text && content.cta_url
    ? `<tr>
                <td align="center" style="padding:24px;">
                  ${button(p, content.cta_text, content.cta_url, bodyFont)}
                </td>
              </tr>`
    : "";

  const footerLines: string[] = [];
  if (e.brand_name) footerLines.push(escapeHtml(e.brand_name));
  if (e.company_address) footerLines.push(escapeHtml(e.company_address));
  if (e.unsubscribe_url) {
    footerLines.push(`<a href="${escapeAttr(e.unsubscribe_url)}" style="color:${p.footer_text}; text-decoration:underline;">Unsubscribe</a>`);
  }
  footerLines.push("You received this email because you opted in to updates from us.");

  const footerHtml = footerLines.map((l) => `<p style="margin:0 0 6px 0; font-family:${bodyFont}; font-size:12px; line-height:1.5; color:${p.footer_text};">${l}</p>`).join("");

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(content.subject)}</title>
<style>
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; }
    .responsive-padding { padding: 16px !important; }
    .responsive-headline { font-size: 24px !important; }
    .responsive-body { font-size: 16px !important; }
    .responsive-cta { min-height: 44px !important; padding: 14px 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:${p.body_bg};">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:${p.body_bg};">
${escapeHtml(content.preheader)}${preheaderSpacers}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${p.body_bg}" style="background-color:${p.body_bg};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" align="center" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:6px; overflow:hidden;">
        <tr>
          <td bgcolor="${p.header_bg}" align="center" style="background-color:${p.header_bg}; padding:24px;">
            ${logoBlock}
            <div style="font-family:${headFont}; font-size:18px; font-weight:bold; color:${p.header_text};">${escapeHtml(e.brand_name || "")}</div>
          </td>
        </tr>
        <tr>
          <td class="responsive-padding" style="padding:32px 32px 8px 32px;">
            <h1 class="responsive-headline" style="margin:0 0 16px 0; font-family:${headFont}; font-size:28px; line-height:1.25; color:${p.body_text};">${escapeHtml(content.headline)}</h1>
            <p class="responsive-body" style="margin:0; font-family:${bodyFont}; font-size:16px; line-height:1.6; color:${p.body_text};">${nl2br(escapeHtml(content.intro))}</p>
          </td>
        </tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid ${p.divider_color}; height:1px; line-height:1px; font-size:1px;">&nbsp;</div></td></tr>
        <tr>
          <td>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${sectionsHtml}
            </table>
          </td>
        </tr>
        ${ctaBlock}
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid ${p.divider_color}; height:1px; line-height:1px; font-size:1px;">&nbsp;</div></td></tr>
        <tr>
          <td class="responsive-padding" style="padding:24px 32px;">
            <p class="responsive-body" style="margin:0; font-family:${bodyFont}; font-size:15px; line-height:1.6; color:${p.body_text};">${nl2br(escapeHtml(content.closing))}</p>
          </td>
        </tr>
        <tr>
          <td bgcolor="${p.footer_bg}" align="center" style="background-color:${p.footer_bg}; padding:20px 24px;">
            ${footerHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Hard cap (warn but don't fail) — most templates land far under
  if (html.length > 102000) {
    console.warn(`[email-assembler] HTML exceeds 100KB target: ${html.length} bytes`);
  }
  return html;
}

function button(p: Palette, text: string, url: string, font: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <td align="center" bgcolor="${p.cta_bg}" style="background-color:${p.cta_bg}; border-radius:4px;">
                        <a class="responsive-cta" href="${escapeAttr(url)}" style="display:inline-block; padding:14px 28px; font-family:${font}; font-size:16px; color:${p.cta_text}; text-decoration:none; font-weight:bold; min-height:20px;">${escapeHtml(text)}</a>
                      </td>
                    </tr>
                  </table>`;
}

// ---------------------------------------------------------------------------
// Plain text builder
// ---------------------------------------------------------------------------
export function buildEmailTxt(content: EmailContent, e: EmailRecord): string {
  if (content.plain_text && content.plain_text.trim().length > 50) {
    // Trust Claude's own plain-text version when it looks substantive
    return content.plain_text.trim() + "\n";
  }

  const lines: string[] = [];
  lines.push(`Subject: ${content.subject}`);
  if (content.preheader) lines.push(`Preheader: ${content.preheader}`);
  lines.push("---");
  lines.push("");
  lines.push(content.headline);
  lines.push("");
  lines.push(content.intro);
  lines.push("");
  for (const s of content.sections || []) {
    lines.push(s.title.toUpperCase());
    lines.push("");
    lines.push(s.body);
    lines.push("");
    if (s.cta_text && s.cta_url) {
      lines.push(`${s.cta_text}: ${s.cta_url}`);
      lines.push("");
    }
  }
  if (content.cta_text && content.cta_url) {
    lines.push(`${content.cta_text}: ${content.cta_url}`);
    lines.push("");
  }
  lines.push("---");
  if (content.closing) {
    lines.push(content.closing);
    lines.push("");
  }
  if (e.brand_name) lines.push(e.brand_name);
  if (e.company_address) lines.push(e.company_address);
  if (e.unsubscribe_url) lines.push(`Unsubscribe: ${e.unsubscribe_url}`);
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// API push (best-effort)
// ---------------------------------------------------------------------------
async function pushToEmailService(
  env: Env,
  e: EmailRecord,
  html: string,
  txt: string,
  subject: string
): Promise<void> {
  const svc = (e.api_push_service || "").toLowerCase();
  if (svc === "sendgrid") {
    if (!e.sendgrid_api_key) throw new Error("SendGrid push enabled but no API key set");
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${e.sendgrid_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: "test@example.com" }] }],
        from: { email: "noreply@submoacontent.com" },
        subject,
        content: [
          { type: "text/plain", value: txt },
          { type: "text/html", value: html },
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid push HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  } else if (svc === "aweber") {
    if (!env.AWEBER_API_KEY) throw new Error("AWEBER_API_KEY secret not set");
    if (!e.aweber_account) throw new Error("AWeber push enabled but no account ID set");
    const res = await fetch(`https://api.aweber.com/1.0/accounts/${encodeURIComponent(e.aweber_account)}/broadcasts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AWEBER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject, html_body: html, plain_text_body: txt }),
    });
    if (!res.ok) throw new Error(`AWeber push HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  }
}

// ---------------------------------------------------------------------------
// OpenRouter (Claude) call
// ---------------------------------------------------------------------------
async function callClaude(env: Env, prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const data: any = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// Color utils
// ---------------------------------------------------------------------------
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!hex) return null;
  const m = hex.trim().toLowerCase().match(/^#?([a-f0-9]{3}|[a-f0-9]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

function normHex(hex: string): string {
  const p = parseHex(hex);
  if (!p) return "#000000";
  return rgbToHex(p);
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; l: number } {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rr: h = (gg - bb) / d + (gg < bb ? 6 : 0); break;
      case gg: h = (bb - rr) / d + 2; break;
      case bb: h = (rr - gg) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: { h: number; s: number; l: number }): { r: number; g: number; b: number } {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if (0 <= hp && hp < 1) { r1 = c; g1 = x; }
  else if (hp < 2) { r1 = x; g1 = c; }
  else if (hp < 3) { g1 = c; b1 = x; }
  else if (hp < 4) { g1 = x; b1 = c; }
  else if (hp < 5) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const m = ln - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function lightenIfClose(hex: string): string {
  const p = parseHex(hex);
  if (!p) return hex;
  const l = relativeLuminance(p);
  if (l > 0.95) return rgbToHex({ r: p.r - 6, g: p.g - 6, b: p.b - 6 });
  return rgbToHex({ r: p.r + 8, g: p.g + 8, b: p.b + 8 });
}

// ---------------------------------------------------------------------------
// HTML utils
// ---------------------------------------------------------------------------
function escapeHtml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
function nl2br(s: string): string {
  return s.replace(/\n/g, "<br />");
}

// ---------------------------------------------------------------------------
// JSON utils
// ---------------------------------------------------------------------------
function safeJson<T>(text: string): T | null {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) { try { return JSON.parse(obj[0]) as T; } catch {} }
  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) { try { return JSON.parse(arr[0]) as T; } catch {} }
  return null;
}
