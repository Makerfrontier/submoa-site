// /api/email-submissions
//   POST  → create a new submission (article_format='email') + email_submissions row, optionally save as template, fire Discord + confirmation email
//   GET   → list email submissions joined to the parent submissions table for the current account

import { getSessionUser, generateId, json } from "../_utils";
import { createProjectFolder } from "../../../src/project-template";
import { emailBriefReceived } from "../discord-notifications";

export async function onRequestPost(context: any) {
  try {
    const user = await getSessionUser(context.request, context.env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await context.request.json();
    const {
      template_type,
      template_name,
      subject_line,
      preheader_text,
      brand_name,
      primary_color,
      secondary_color,
      brand_voice,
      logo_url,
      author,
      content_brief,
      sections,
      cta_text,
      cta_url,
      unsubscribe_url,
      company_address,
      sendgrid_api_key,
      aweber_account,
      api_push_enabled,
      api_push_service,
      save_as_template,
    } = body || {};

    if (!template_type || !template_name || !subject_line || !content_brief) {
      return json({ error: "template_type, template_name, subject_line, and content_brief are required" }, 400);
    }

    if (template_type === "marketing") {
      if (!unsubscribe_url || !company_address) {
        return json({ error: "Marketing emails require unsubscribe_url and company_address (CAN-SPAM)" }, 400);
      }
    }

    const submissionId = generateId();
    const emailRecordId = generateId();
    const now = Date.now();

    // 1. Parent submission row — slot it into the existing pipeline
    await context.env.submoacontent_db.prepare(
      `INSERT INTO submissions
        (id, user_id, topic, author, article_format, optimization_target, tone_stance,
         min_word_count, target_keywords, seo_research, human_observation,
         include_faq, has_images, generate_audio, email,
         status, created_at, updated_at, account_id)
       VALUES (?, ?, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'brief', ?, ?, ?)`
    ).bind(
      submissionId,
      user.id,
      content_brief,                                    // topic = brief
      author || "unassigned",
      "email",                                          // optimization_target
      "neutral",                                        // tone_stance
      "300",                                            // min_word_count placeholder
      null,                                             // target_keywords
      0,                                                // seo_research
      "",                                               // human_observation
      0,                                                // include_faq
      0,                                                // has_images
      0,                                                // generate_audio
      user.email || null,
      now, now,
      user.account_id || "makerfrontier"
    ).run();

    // 2. Email-specific row
    const sectionsJson = sections ? JSON.stringify(sections) : null;
    await context.env.submoacontent_db.prepare(
      `INSERT INTO email_submissions
        (id, submission_id, template_type, template_name, subject_line, preheader_text,
         brand_name, primary_color, secondary_color, brand_voice, logo_url,
         cta_text, cta_url, unsubscribe_url, company_address, sections,
         sendgrid_api_key, aweber_account, api_push_enabled, api_push_service,
         email_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      emailRecordId,
      submissionId,
      template_type,
      template_name,
      subject_line,
      preheader_text || null,
      brand_name || null,
      primary_color || "#c8973a",
      secondary_color || "#1e3a1e",
      brand_voice || null,
      logo_url || null,
      cta_text || null,
      cta_url || null,
      unsubscribe_url || null,
      company_address || null,
      sectionsJson,
      sendgrid_api_key || null,
      aweber_account || null,
      api_push_enabled ? 1 : 0,
      api_push_service || null,
      "queued",
      now
    ).run();

    // 3. Save as template (optional)
    if (save_as_template) {
      await context.env.submoacontent_db.prepare(
        `INSERT INTO email_templates
          (id, account_id, template_name, template_type, subject_line, preheader_text,
           brand_name, primary_color, secondary_color, brand_voice, logo_url,
           cta_text, cta_url, unsubscribe_url, company_address, sections,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        generateId(),
        user.account_id || "makerfrontier",
        template_name,
        template_type,
        subject_line,
        preheader_text || null,
        brand_name || null,
        primary_color || null,
        secondary_color || null,
        brand_voice || null,
        logo_url || null,
        cta_text || null,
        cta_url || null,
        unsubscribe_url || null,
        company_address || null,
        sectionsJson,
        now, now
      ).run();
    }

    // 4. Project folder + queue
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

    // 5. Discord wake notification (email-specific phrasing)
    context.waitUntil(
      postEmailWake(context.env, { id: submissionId, template_name, template_type })
        .catch((e: any) => console.error("Discord email wake failed:", e?.message ?? e))
    );

    // 6. Confirmation email to user
    if (user.email) {
      context.waitUntil(
        emailBriefReceived(context.env as any, user.email, { id: submissionId, title: template_name })
          .catch((e: any) => console.error("Confirmation email failed:", e?.message ?? e))
      );
    }

    return json({ ok: true, submission_id: submissionId, email_id: emailRecordId }, 201);
  } catch (e: any) {
    console.error("[email-submissions POST] error:", e);
    return json({ error: e?.message || "Server error" }, 500);
  }
}

export async function onRequestGet(context: any) {
  try {
    const user = await getSessionUser(context.request, context.env);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { results } = await context.env.submoacontent_db.prepare(
      `SELECT s.id, s.topic, s.status, s.created_at,
              e.id as email_id, e.template_name, e.template_type,
              e.primary_color, e.secondary_color, e.email_status, e.subject_line
         FROM submissions s
         JOIN email_submissions e ON e.submission_id = s.id
        WHERE s.user_id = ?
        ORDER BY s.created_at DESC`
    ).bind(user.id).all();

    return json({ submissions: results || [] });
  } catch (e: any) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

async function postEmailWake(
  env: any,
  data: { id: string; template_name: string; template_type: string }
): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN) return;
  const channelId = "1493283525795905557";
  const message = [
    `📧 **NEW EMAIL BRIEF** — ${data.template_name} (${data.template_type})`,
    ``,
    `**Submission ID:** \`${data.id}\``,
    ``,
    `Sydney — retrieve this brief from the database:`,
    `\`SELECT * FROM email_submissions WHERE submission_id = '${data.id}'\``,
    ``,
    `Build the email HTML and post back when complete.`,
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
