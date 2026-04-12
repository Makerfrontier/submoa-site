/**
 * Submission Notification Worker
 * Runs on a cron schedule to watch for new draft submissions
 * and ping Discord when one arrives
 */

interface Env {
  submoacontent_db: D1Database;
  DISCORD_WEBHOOK_URL: string;
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Check for new drafts in the last 10 minutes
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;

    const result = await env.submoacontent_db
      .prepare(`
        SELECT s.*, u.name as user_name, u.email as user_email
        FROM submissions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.status = 'draft'
        AND s.created_at > ?
        ORDER BY s.created_at ASC
      `)
      .bind(tenMinutesAgo)
      .all() as any;

    if (!result.results || result.results.length === 0) {
      return;
    }

    const webhookUrl = env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    for (const submission of result.results) {
      const authorLabel = getAuthorLabel(submission.author);

      const payload = {
        embeds: [{
          title: "📝 New Content Brief",
          color: 0xD4AF37, // hunter gold
          fields: [
            { name: "Topic", value: submission.topic || "No topic", inline: false },
            { name: "Author", value: authorLabel, inline: true },
            { name: "Format", value: getFormatLabel(submission.article_format), inline: true },
            { name: "Word Count", value: `${submission.min_word_count || 1200}+ words`, inline: true },
            { name: "Vocal Tone", value: submission.vocal_tone || "Default", inline: true },
          ],
          ...(submission.product_link && {
            fields: [
              { name: "Product", value: submission.product_link, inline: false }
            ]
          }),
          footer: {
            text: `Submitted by ${submission.email} • ID: ${submission.id.slice(0, 8)}`
          },
          timestamp: new Date(submission.created_at).toISOString()
        }]
      };

      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Mark as notified so we don't ping twice
      await env.submoacontent_db
        .prepare(`UPDATE submissions SET status = 'notified' WHERE id = ?`)
        .bind(submission.id)
        .run();
    }
  }
};

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