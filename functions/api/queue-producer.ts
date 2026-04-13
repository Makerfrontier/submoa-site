// src/queue-producer.ts
// Called from the brief submission endpoint.
// Saves submission to DB, enqueues generation job, fires notifications.

import { notifyBriefSubmitted, emailBriefReceived } from "./notifications";

interface Env {
  submoacontent_db: D1Database;
  GENERATION_QUEUE: Queue;
  DISCORD_BOT_TOKEN: string;
  RESEND_API_KEY: string;
  APP_URL?: string;
}

export interface GenerationJob {
  submission_id: string;
  queued_at: number;
}

// ---------------------------------------------------------------------------
// Call this from your POST /api/submissions handler
// after the submission row is saved to DB
// ---------------------------------------------------------------------------
export async function enqueueGenerationJob(
  env: Env,
  submissionId: string
): Promise<void> {
  // Fetch submission + author details for notifications
  const submission = await env.submoacontent_db.prepare(
    `SELECT s.id, s.topic, s.article_format, s.optimization_target,
            ap.name as author_display_name,
            u.email as author_email
     FROM submissions s
     LEFT JOIN author_profiles ap ON s.author = ap.slug
     LEFT JOIN users u ON ap.account_id = u.account_id
     WHERE s.id = ?`
  )
    .bind(submissionId)
    .first<{
      id: string;
      topic: string;
      article_format: string;
      optimization_target: string;
      author_display_name: string | null;
      author_email: string | null;
    }>();

  if (!submission) {
    console.error("enqueueGenerationJob: submission not found", submissionId);
    return;
  }

  // Mark submission as queued
  await env.submoacontent_db.prepare(
    `UPDATE submissions SET status = 'queued', updated_at = ? WHERE id = ?`
  )
    .bind(Date.now(), submissionId)
    .run();

  // Enqueue the generation job
  const job: GenerationJob = {
    submission_id: submissionId,
    queued_at: Date.now(),
  };

  await env.GENERATION_QUEUE.send(job);

  console.log(`Enqueued generation job for submission ${submissionId}`);

  // Discord — wake Sydney with brief details + DB query instructions
  await notifyBriefSubmitted(env, {
    id: submission.id,
    title: submission.topic,
    author_display_name: submission.author_display_name ?? "Unknown",
    article_format: submission.article_format,
    optimization_target: submission.optimization_target,
  });

  // Email user confirmation
  if (submission.author_email) {
    await emailBriefReceived(env, submission.author_email, {
      id: submission.id,
      title: submission.topic,
    });
  }
}
