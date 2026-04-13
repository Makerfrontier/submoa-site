/**
 * Submission Cron Notifier
 * Cloudflare Worker - runs every 5 minutes
 * Checks for new draft submissions and notifies Discord
 */

export default {
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    await notifyNewSubmissions(env);
    // Trigger grading for any ungraded articles
    if (env.CRON_SECRET) {
      ctx.waitUntil(
        fetch(`${env.APP_URL || 'https://www.submoacontent.com'}/api/admin/grading/grade-all`, {
          method: 'POST',
          headers: { 'x-cron-secret': env.CRON_SECRET },
        })
      );
    }
  },

  // Allow manual trigger via fetch for testing
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (request.method === 'POST' || request.url.includes('/notify')) {
      await notifyNewSubmissions(env);
      return new Response('Notification check complete');
    }
    return new Response('Not found', { status: 404 });
  }
};

interface Env {
  submoacontent_db: D1Database;
  DISCORD_WEBHOOK_URL: string;
  APP_URL?: string;
  CRON_SECRET?: string;
}

async function notifyNewSubmissions(env: Env): Promise<void> {
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('DISCORD_WEBHOOK_URL not set');
    return;
  }

  // Check for new drafts (not yet notified)
  const result = await env.submoacontent_db
    .prepare(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.status = 'draft'
      ORDER BY s.created_at ASC
    `)
    .all() as any;

  if (result.results && result.results.length > 0) {
    for (const submission of result.results) {
      const authorLabel = getAuthorLabel(submission.author);
      const formatLabel = getFormatLabel(submission.article_format);

      const embed = {
        username: "SubMoa Content",
        avatar_url: "https://submoacontent.com/logo.jpg",
        embeds: [{
          title: "📝 New Content Brief Received",
          color: 0xC9A84C,
          fields: [
            { name: "Topic", value: truncate(submission.topic || "No topic", 1024), inline: false },
            { name: "Author Profile", value: authorLabel, inline: true },
            { name: "Format", value: formatLabel, inline: true },
            { name: "Word Count", value: `${submission.min_word_count || 1200}+ words`, inline: true },
            { name: "Vocal Tone", value: submission.vocal_tone || "Default", inline: true },
            { name: "Human Observation", value: truncate(submission.human_observation || "None provided", 1024), inline: false },
            ...(submission.anecdotal_stories ? [{ name: "Anecdotes", value: truncate(submission.anecdotal_stories, 1024), inline: false }] : []),
            ...(submission.target_keywords ? [{ name: "Target Keywords", value: submission.target_keywords, inline: false }] : []),
          ],
          footer: {
            text: `From ${submission.email} • ID: ${submission.id.slice(0, 8)}`
          },
          timestamp: new Date(submission.created_at).toISOString()
        }]
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(embed),
      });

      if (response.ok) {
        await env.submoacontent_db
          .prepare(`UPDATE submissions SET status = 'notified' WHERE id = ?`)
          .bind(submission.id)
          .run();
      }
    }
  }

  // Check for revision requests
  const revisions = await env.submoacontent_db
    .prepare(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM submissions s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.status = 'revision_requested'
      ORDER BY s.updated_at ASC
    `)
    .all() as any;

  if (revisions.results && revisions.results.length > 0) {
    for (const sub of revisions.results) {
      const embed = {
        username: "SubMoa Content",
        avatar_url: "https://submoacontent.com/logo.jpg",
        embeds: [{
          title: "🔁 Revision Requested",
          color: 0xD97706,
          fields: [
            { name: "Topic", value: truncate(sub.topic || "No topic", 1024), inline: false },
            { name: "Author", value: sub.author || "Unknown", inline: true },
            { name: "Requested By", value: sub.email || "Unknown", inline: true },
            { name: "Revision Notes", value: truncate(sub.revision_notes || "No notes provided", 1024), inline: false },
          ],
          footer: {
            text: `Submission ID: ${sub.id.slice(0, 8)}`
          },
          timestamp: new Date(sub.updated_at).toISOString()
        }]
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(embed),
      });

      if (response.ok) {
        await env.submoacontent_db
          .prepare(`UPDATE submissions SET status = 'revision_notified' WHERE id = ?`)
          .bind(sub.id)
          .run();
      }
    }
  }
}

function getAuthorLabel(authorId: string): string {
  const map: Record<string, string> = {
    "ben-ryder": "Ben Ryder — First Person Field Reviewer",
    "andy-husek": "Andy Husek — Trusted Field Expert",
    "adam-scepaniak": "Adam Scepaniak — Formal Product Manager",
    "sydney": "Sydney — AI Agent",
  };
  return map[authorId] || authorId;
}

function getFormatLabel(formatId: string): string {
  const map: Record<string, string> = {
    "seo-blog": "SEO Blog Article",
    "scientific": "Scientific Research Paper",
    "llm-blog": "LLM-Optimized Blog",
    "discover-news": "Google Discover News",
  };
  return map[formatId] || formatId;
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}