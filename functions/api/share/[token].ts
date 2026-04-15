// GET /api/share/:token — fully public share page. No auth.

function parseToken(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('share');
  return idx >= 0 ? parts[idx + 1] ?? null : null;
}

function esc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function expiredPage(): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Link expired</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>body{margin:0;background:#EDE8DF;color:#221A10;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px}
.c{background:#FAF7F2;border:1px solid #CDC5B4;border-radius:12px;padding:40px;max-width:420px;text-align:center}
.c h1{font-family:'Playfair Display',serif;font-size:22px;margin:0 0 10px;color:#221A10}
.c p{color:#6B5744;font-size:14px;line-height:1.6;margin:0}</style></head>
<body><div class="c"><h1>This link has expired or does not exist.</h1><p>Ask the sender for a fresh share link.</p></div></body></html>`;
}

function publicPage(title: string, html: string, daysLeft: number): string {
  const daysLabel = daysLeft > 1 ? `${daysLeft} days` : daysLeft === 1 ? '1 day' : 'less than a day';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800&family=Crimson+Pro:wght@400;600&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{--bg:#EDE8DF;--card:#FAF7F2;--text:#221A10;--mid:#6B5744;--amber:#B8872E;--amber-light:#F5EDD8;--amber-border:rgba(184,135,46,0.2);--border:#CDC5B4;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font-family:'Crimson Pro','Georgia',serif;line-height:1.8;font-size:20px}
  header{padding:20px 24px;border-bottom:1px solid var(--border);background:var(--bg);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
  header .brand{font-family:'Playfair Display',serif;font-weight:700;font-size:18px;color:var(--text)}
  header .exp{font-family:'DM Sans',sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:var(--amber);background:var(--amber-light);padding:4px 10px;border:1px solid var(--amber-border);border-radius:100px;font-weight:600}
  main{max-width:740px;margin:0 auto;padding:48px 24px 80px}
  h1.title{font-family:'Playfair Display',serif;font-size:clamp(26px,5vw,40px);line-height:1.2;color:var(--text);margin:0 0 28px}
  article{font-size:20px;line-height:1.8;color:var(--text)}
  article h1,article h2,article h3,article h4{font-family:'Playfair Display',serif;color:var(--text);line-height:1.25;margin:1.6em 0 0.6em}
  article h1{font-size:32px}article h2{font-size:26px}article h3{font-size:22px}
  article p{margin:0 0 1.2em}article a{color:#3D5A3E;text-decoration:underline}
  article img{max-width:100%;height:auto;border-radius:8px;margin:1em 0}
  article ul,article ol{margin:0 0 1.2em;padding-left:1.4em}article li{margin-bottom:0.4em}
  article blockquote{border-left:3px solid var(--amber);padding:0 0 0 18px;color:var(--mid);margin:1.4em 0;font-style:italic}
  footer{padding:24px;border-top:1px solid var(--border);text-align:center;font-family:'DM Sans',sans-serif;font-size:12px;color:var(--mid)}
</style></head>
<body>
<header><div class="brand">Sub Moa Content</div><div class="exp">Expires in ${esc(daysLabel)}</div></header>
<main><h1 class="title">${esc(title)}</h1><article>${html}</article></main>
<footer>Created with SubMoa Content.</footer>
</body></html>`;
}

export async function onRequestGet({ request, env }: any) {
  const url = new URL(request.url);
  const token = parseToken(url.pathname);
  if (!token) return new Response(expiredPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const link: any = await env.submoacontent_db.prepare(
    'SELECT submission_id, expires_at FROM share_links WHERE token = ? AND expires_at > unixepoch()'
  ).bind(token).first();
  if (!link) return new Response(expiredPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const sub: any = await env.submoacontent_db.prepare(
    'SELECT id, topic, article_content FROM submissions WHERE id = ?'
  ).bind(link.submission_id).first();
  if (!sub) return new Response(expiredPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  // Try rendered HTML in R2 first; fall back to raw article_content (markdown/HTML string)
  let bodyHtml = '';
  const r2 = await env.SUBMOA_IMAGES.get(`projects/${link.submission_id}/article/article.html`);
  if (r2) {
    const full = await r2.text();
    // Extract <body> inner HTML if a full doc
    const m = full.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    bodyHtml = m ? m[1] : full;
  } else if (sub.article_content) {
    bodyHtml = sub.article_content;
  } else {
    return new Response(expiredPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const daysLeft = Math.max(0, Math.ceil((Number(link.expires_at) - Math.floor(Date.now() / 1000)) / 86400));

  return new Response(publicPage(sub.topic || 'Article', bodyHtml, daysLeft), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
