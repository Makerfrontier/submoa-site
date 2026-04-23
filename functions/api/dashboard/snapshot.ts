// GET /api/dashboard/snapshot
// One-shot aggregator for the dashboard. Returns everything any widget
// could render, so the dashboard pays a single round-trip on load. Each
// section is best-effort — missing tables return empty arrays rather than
// erroring the whole snapshot.

import { getSessionUser, json } from '../_utils';

const SEVEN_DAYS = 7 * 24 * 60 * 60;

async function safe(fn: () => Promise<any>, fallback: any) {
  try { return await fn(); } catch { return fallback; }
}

export async function onRequest(context: { request: Request; env: any }) {
  const { request, env } = context;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: 'Not authenticated' }, 401);

  const accountId = (user as any).account_id || 'makerfrontier';
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - SEVEN_DAYS;

  // Stats
  const stats: any = {
    in_progress: 0,
    published_week: 0,
    quark_cast_eps: 0,
    flash_gens: 0,
  };
  await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) AS c FROM submissions WHERE account_id = ? AND status IN ('queued', 'generating', 'grading', 'draft')`
    ).bind(accountId).first();
    stats.in_progress = Number(r?.c || 0);
  }, null);
  await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) AS c FROM submissions WHERE account_id = ? AND status = 'published' AND updated_at >= ?`
    ).bind(accountId, weekAgo).first();
    stats.published_week = Number(r?.c || 0);
  }, null);
  await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) AS c FROM podcast_episodes WHERE account_id = ? AND source = 'quick'`
    ).bind(accountId).first();
    stats.quark_cast_eps = Number(r?.c || 0);
  }, null);
  await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT COUNT(*) AS c FROM flash_gens WHERE account_id = ?`
    ).bind(accountId).first();
    stats.flash_gens = Number(r?.c || 0);
  }, null);

  const recentArticles = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, topic AS title, article_format, status, created_at
       FROM submissions WHERE account_id = ? AND (article_format IS NULL OR article_format NOT IN ('email','presentation','infographic'))
       ORDER BY created_at DESC LIMIT 5`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const quarkCast = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, topic AS title, status, audio_duration_seconds, created_at
       FROM podcast_episodes WHERE account_id = ? AND source = 'quick'
       ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const atomicFlash = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, prompt, image_url, created_at FROM flash_gens
       WHERE account_id = ? ORDER BY created_at DESC LIMIT 6`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const morningBrief = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT * FROM legislative_intel_snapshots
       WHERE scope = 'federal' ORDER BY pulled_at DESC LIMIT 1`
    ).first();
    if (!r) return { hot: [], anomalies: [] };
    const hot = (() => { try { return JSON.parse(r.hot_bills_data || '[]'); } catch { return []; } })();
    const anomalies = (() => { try { return JSON.parse(r.anomaly_alerts || '[]'); } catch { return []; } })();
    return { hot: hot.slice(0, 4), anomalies };
  }, { hot: [], anomalies: [] });

  const compDrafts = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, title, updated_at FROM comp_studio_drafts WHERE account_id = ? ORDER BY updated_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const itineraries = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, title, updated_at FROM planner_itineraries WHERE account_id = ? ORDER BY updated_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const presentations = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, topic AS title, status, created_at FROM presentation_submissions WHERE account_id = ? ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const emails = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, topic AS title, status, created_at FROM email_submissions WHERE account_id = ? ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const savedPrompts = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, title, target_model, created_at FROM prompt_builder WHERE account_id = ? ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const pressReleases = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, business_name, product_or_news, status, created_at FROM press_release WHERE account_id = ? ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  const briefs = await safe(async () => {
    const r: any = await env.submoacontent_db.prepare(
      `SELECT id, title, brief_type, status, created_at FROM brief_builder_briefs WHERE account_id = ? ORDER BY created_at DESC LIMIT 4`
    ).bind(accountId).all();
    return r.results || [];
  }, []);

  // Activity = simple merge of the most recent item from every feature, then
  // sort by ts desc, cap at 6.
  const activity = [
    ...(recentArticles as any[]).map((x: any) => ({ ts: x.created_at, tag: 'article',      text: x.title })),
    ...(quarkCast as any[]).map((x: any)      => ({ ts: x.created_at, tag: 'quark-cast',   text: x.title })),
    ...(atomicFlash as any[]).map((x: any)    => ({ ts: x.created_at, tag: 'flash',        text: String(x.prompt || '').slice(0, 80) })),
    ...(presentations as any[]).map((x: any)  => ({ ts: x.created_at, tag: 'powerpoint',   text: x.title })),
    ...(emails as any[]).map((x: any)         => ({ ts: x.created_at, tag: 'email',        text: x.title })),
    ...(briefs as any[]).map((x: any)         => ({ ts: x.created_at, tag: 'brief',        text: x.title })),
    ...(pressReleases as any[]).map((x: any)  => ({ ts: x.created_at, tag: 'press',        text: x.product_or_news || x.business_name })),
  ].filter(x => x.ts && x.text).sort((a, b) => b.ts - a.ts).slice(0, 6);

  return json({
    stats,
    recent_articles: recentArticles,
    quark_cast: quarkCast,
    atomic_flash: atomicFlash,
    morning_brief: morningBrief,
    comp_drafts: compDrafts,
    itineraries,
    presentations,
    emails,
    saved_prompts: savedPrompts,
    press_releases: pressReleases,
    briefs,
    activity,
  });
}
