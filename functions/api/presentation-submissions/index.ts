// /api/presentation-submissions
//   POST → multipart form (template + optional images + JSON metadata) → submission + presentation_submissions row + queue
//   GET  → list presentations for current account

import { getSessionUser, generateId, json } from "../_utils";
import { createProjectFolder } from "../../../src/project-template";
import { emailBriefReceived } from "../discord-notifications";

const ALLOWED_IMG = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMG_SIZE = 8 * 1024 * 1024; // 8 MB
const MAX_TEMPLATE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function onRequestPost(context: any) {
  try {
    const user = await getSessionUser(context.request, context.env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    let formData: FormData;
    try {
      formData = await context.request.formData();
    } catch {
      return json({ error: "Multipart form data required" }, 400);
    }

    const topic = (formData.get("topic") || "").toString().trim();
    const author = (formData.get("author") || "").toString().trim();
    const keyDetails = (formData.get("key_details") || "").toString().trim();
    const targetKeywords = (formData.get("target_keywords") || "").toString().trim();
    const slideCountRaw = (formData.get("slide_count_target") || "").toString().trim();
    const slideCountTarget = slideCountRaw ? parseInt(slideCountRaw, 10) || null : null;
    const includeCharts = (formData.get("include_charts") || "").toString() === "1";
    const includeImages = (formData.get("include_images") || "").toString() === "1";
    const structuredNotesRaw = (formData.get("structured_notes") || "").toString();

    if (!topic) return json({ error: "topic is required" }, 400);
    // key_details is derived from the purpose field in the new form — the
    // old mandatory guard produced bogus 400s when the field was empty.

    // Visual tone — used when no .pptx template is uploaded. The consumer
    // applies these via CSS custom properties + luminance-derived text colors.
    const primaryColor = (formData.get("primary_color") || "#3D5A3E").toString();
    const accentColor = (formData.get("accent_color") || "#B8872E").toString();
    const backgroundColor = (formData.get("background_color") || "#FAF7F2").toString();
    const styleDirection = (formData.get("style_direction") || "").toString();
    // Part 4 additions — optional emotional context + brand brief R2 key.
    const emotionalContext = (formData.get("emotional_context") || "").toString().trim() || null;
    const brandBriefR2Key = (formData.get("brand_brief_r2_key") || "").toString().trim() || null;

    const template = formData.get("template");
    // The user may have already uploaded the template via the Upload Your Own
    // card — in that case the analyze-template endpoint stashed it in R2 and
    // returned a key. Prefer that key when present so we don't duplicate.
    const customKey = (formData.get("custom_template_r2_key") || "").toString().trim();
    let templateKey: string | null = customKey || null;
    let templateFilename: string | null = customKey ? customKey.split('/').pop() || null : null;
    const hasTemplate = template instanceof File && template.size > 0;
    const submissionId = generateId();
    const presId = generateId();
    const now = Date.now();

    if (hasTemplate) {
      const f = template as File;
      if (!f.name.toLowerCase().endsWith(".pptx")) {
        return json({ error: "Template must be a .pptx file" }, 400);
      }
      if (f.size > MAX_TEMPLATE_SIZE) {
        return json({ error: "Template exceeds 25 MB limit" }, 400);
      }
      // 1. Upload template
      templateKey = `projects/${submissionId}/presentation/template.pptx`;
      templateFilename = f.name;
      await context.env.SUBMOA_IMAGES.put(templateKey, await f.arrayBuffer(), {
        httpMetadata: { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
      });
    }

    // 2. Upload images (if requested)
    const imageKeys: string[] = [];
    if (includeImages) {
      const files = formData.getAll("images") as File[];
      for (let i = 0; i < files.length && i < 10; i++) {
        const f = files[i];
        if (!(f instanceof File) || !f.size) continue;
        if (!ALLOWED_IMG.includes(f.type)) continue;
        if (f.size > MAX_IMG_SIZE) continue;
        const safe = sanitize(f.name) || `image-${i + 1}`;
        const key = `projects/${submissionId}/presentation/images/${safe}`;
        await context.env.SUBMOA_IMAGES.put(key, await f.arrayBuffer(), {
          httpMetadata: { contentType: f.type },
        });
        imageKeys.push(key);
      }
    }

    // 3. Parent submission
    await context.env.submoacontent_db.prepare(
      `INSERT INTO submissions
        (id, user_id, topic, author, article_format, optimization_target, tone_stance,
         min_word_count, target_keywords, seo_research, human_observation,
         include_faq, has_images, generate_audio, email,
         status, created_at, updated_at, account_id)
       VALUES (?, ?, ?, ?, 'presentation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brief', ?, ?, ?)`
    ).bind(
      submissionId,
      user.id,
      topic,
      author || "unassigned",
      "presentation",
      "neutral",
      "300",
      targetKeywords || null,
      0, "",
      0, includeImages ? 1 : 0, 0,
      user.email || null,
      now, now,
      user.account_id || "makerfrontier"
    ).run();

    // 4. Presentation row
    // Pack visual tone (used by the consumer when no template file was uploaded).
    const visualTone = {
      primary_color: primaryColor,
      accent_color: accentColor,
      background_color: backgroundColor,
      style_direction: styleDirection,
    };
    const structuredNotesForStorage = (() => {
      try {
        const parsed = structuredNotesRaw ? JSON.parse(structuredNotesRaw) : null;
        // Merge visual tone into the structured_notes blob so the consumer
        // sees it without schema changes.
        return JSON.stringify({ slides: parsed, visual_tone: visualTone });
      } catch {
        return JSON.stringify({ notes: structuredNotesRaw, visual_tone: visualTone });
      }
    })();

    await context.env.submoacontent_db.prepare(
      `INSERT INTO presentation_submissions
        (id, submission_id, template_r2_key, template_filename, slide_count_target,
         key_details, structured_notes, include_charts, include_images, image_r2_keys,
         presentation_status, created_at, emotional_context, brand_brief_r2_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      presId,
      submissionId,
      templateKey || null,
      templateFilename || null,
      slideCountTarget,
      keyDetails,
      structuredNotesForStorage,
      includeCharts ? 1 : 0,
      includeImages ? 1 : 0,
      imageKeys.length ? JSON.stringify(imageKeys) : null,
      "queued",
      now,
      emotionalContext,
      brandBriefR2Key,
    ).run();

    // 5. Project folder + queue
    context.waitUntil(
      createProjectFolder(context.env as any, submissionId).catch((e: any) =>
        console.error("createProjectFolder failed:", e?.message ?? e)
      )
    );
    context.waitUntil(
      (async () => {
        try {
          const { enqueueGenerationJob } = await import("../queue-producer");
          await enqueueGenerationJob(context.env as any, submissionId);
        } catch (e: any) {
          console.error("enqueueGenerationJob failed:", e?.message ?? e);
        }
      })()
    );

    // 6. Discord wake
    context.waitUntil(
      postPresentationWake(context.env, {
        id: submissionId,
        topic,
        templateFilename: templateFilename || '(no template — visual tone driven)',
        slideCountTarget,
        includeCharts,
        includeImages,
      }).catch((e: any) => console.error("Discord wake failed:", e?.message ?? e))
    );

    // 7. User confirmation email
    if (user.email) {
      context.waitUntil(
        emailBriefReceived(context.env as any, user.email, { id: submissionId, title: topic })
          .catch((e: any) => console.error("Confirmation email failed:", e?.message ?? e))
      );
    }

    return json({ ok: true, submission_id: submissionId, presentation_id: presId }, 201);
  } catch (e: any) {
    console.error("[presentation-submissions POST] error:", e);
    return json({ error: e?.message || "Server error" }, 500);
  }
}

export async function onRequestGet(context: any) {
  try {
    const user = await getSessionUser(context.request, context.env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { results } = await context.env.submoacontent_db.prepare(
      `SELECT s.id, s.topic, s.status, s.created_at,
              p.id as pres_id, p.template_filename, p.slide_count_target, p.slide_count_actual,
              p.presentation_status, p.include_charts, p.include_images
         FROM submissions s
         JOIN presentation_submissions p ON p.submission_id = s.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC`
    ).bind(user.id).all();

    return json({ submissions: results || [] });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

function sanitize(name: string): string {
  return (name || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function postPresentationWake(
  env: any,
  d: { id: string; topic: string; templateFilename: string; slideCountTarget: number | null; includeCharts: boolean; includeImages: boolean }
): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN) return;
  const channelId = "1493283525795905557";
  const message = [
    `📊 **NEW PRESENTATION BRIEF** — ${d.topic}`,
    ``,
    `**Submission ID:** \`${d.id}\``,
    `**Template:** ${d.templateFilename}`,
    `**Slides:** ${d.slideCountTarget ? d.slideCountTarget : "agent decides"}`,
    `**Charts:** ${d.includeCharts ? "yes" : "no"} **Images:** ${d.includeImages ? "yes" : "no"}`,
    ``,
    `Sydney — retrieve this brief from the database:`,
    `\`SELECT * FROM presentation_submissions WHERE submission_id = '${d.id}'\``,
    ``,
    `The consumer will assemble the deck automatically; this is informational.`,
  ].join("\n");
  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: message }),
  });
}
