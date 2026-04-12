/**
 * Article Download API
 * GET /api/download?path=/content/...&format=viewer
 *   → renders beautifully formatted article page with Download Text button
 * GET /api/download?path=/content/...&format=doc
 *   → downloads as .doc (Word-compatible HTML)
 * GET /api/download?path=/content/...
 *   → default: downloads as formatted .doc
 */

interface Env {}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const filePath = url.searchParams.get('path');
    const format = url.searchParams.get('format') || 'doc';

    if (!filePath || !filePath.startsWith('/content/') || !filePath.endsWith('.md')) {
      return new Response('Invalid path', { status: 400 });
    }

    // Fetch the markdown file
    const origin = url.origin;
    let mdContent: string;
    try {
      const res = await fetch(`${origin}${filePath}`);
      if (!res.ok) throw new Error('Not found');
      mdContent = await res.text();
    } catch {
      return new Response('Article not found', { status: 404 });
    }

    const filename = filePath.split('/').pop()!.replace('.md', '');
    const slug = filename;
    const title = formatTitle(filename);
    const author = formatAuthor(filename);

    if (format === 'viewer') {
      const htmlBody = renderMarkdownToHtml(mdContent);
      const html = buildViewerPage(title, author, htmlBody, slug);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    if (format === 'txt') {
      // Strip markdown syntax and return plain text
      const plainText = stripMarkdown(mdContent);
      return new Response(plainText, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${slug}.txt"`,
        }
      });
    }

    // Default: formatted HTML as .doc (Word-compatible)
    const htmlBody = renderMarkdownToHtml(mdContent);
    const docHtml = buildDocHtml(title, author, htmlBody);
    const docFilename = `${slug}.doc`;

    return new Response(docHtml, {
      headers: {
        'Content-Type': 'application/msword',
        'Content-Disposition': `attachment; filename="${docFilename}"`,
      }
    });
  }
};

function formatTitle(filename: string): string {
  return filename
    .replace(/^[a-z]+-[a-z]+-\d+-/, '') // remove id prefix
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(/^(Ben|Andy|Adam|Sydney) /, '$1 — ');
}

function formatAuthor(filename: string): string {
  const nameMap: Record<string, string> = {
    'ben-ryder': 'Ben Ryder',
    'andy-husek': 'Andy Husek',
    'adam-scepaniak': 'Adam Scepaniak',
    'sydney': 'Sydney',
  };
  const firstTwo = filename.split('-').slice(0, 2).join('-');
  return nameMap[firstTwo] || 'SubMoa Author';
}

function stripMarkdown(md: string): string {
  let text = md;
  if (text.startsWith('---')) {
    const end = text.indexOf('---', 3);
    if (end !== -1) text = text.slice(end + 3);
  }
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
    .replace(/^---$/gm, '────────────────────────')
    .replace(/\|.+\|/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderMarkdownToHtml(md: string): string {
  if (md.startsWith('---')) {
    const end = md.indexOf('---', 3);
    if (end !== -1) md = md.slice(end + 3);
  }

  const lines = md.split('\n');
  const output: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) { output.push('</ul>'); inList = false; }
      continue;
    }

    if (trimmed.startsWith('## ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('### ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('# ')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { output.push('<ul>'); inList = true; }
      output.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) { output.push('<ol>'); inList = true; }
      output.push(`<li>${inlineFormat(trimmed.replace(/^\d+\.\s/, ''))}</li>`);
    } else if (trimmed.startsWith('---')) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push('<hr>');
    } else if (trimmed.startsWith('*') && trimmed.endsWith('*') && trimmed.split('*').length === 3) {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<p><em>${inlineFormat(trimmed.slice(1, -1))}</em></p>`);
    } else {
      if (inList) { output.push('</ul>'); inList = false; }
      output.push(`<p>${inlineFormat(trimmed)}</p>`);
    }
  }
  if (inList) output.push('</ul>');
  return output.join('\n');
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function buildViewerPage(title: string, author: string, body: string, slug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Source Serif 4', Georgia, serif;
      background: #faf9f7;
      color: #1c1917;
      font-size: 19px;
      line-height: 1.75;
      -webkit-font-smoothing: antialiased;
    }
    /* Header */
    .article-header {
      background: #0c0a09;
      color: #faf9f7;
      padding: 3rem 2rem 2.5rem;
      border-bottom: 3px solid #c9a84c;
    }
    .article-header-inner {
      max-width: 720px;
      margin: 0 auto;
    }
    .site-tag {
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #c9a84c;
      margin-bottom: 1.25rem;
    }
    .article-title {
      font-family: 'Playfair Display', serif;
      font-size: clamp(1.875rem, 5vw, 2.75rem);
      font-weight: 700;
      line-height: 1.15;
      margin-bottom: 1.25rem;
      color: #faf9f7;
    }
    .article-meta {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: #a8a29e;
      padding-top: 1rem;
      border-top: 1px solid rgba(255,255,255,0.15);
    }
    .article-meta strong { color: #d6d3d1; }
    /* Body */
    .article-body {
      max-width: 720px;
      margin: 0 auto;
      padding: 3rem 2rem 4rem;
    }
    .article-body h1 { font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700; margin: 2.5rem 0 1rem; }
    .article-body h2 { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 600; margin: 2.5rem 0 0.75rem; color: #0c0a09; border-bottom: 1px solid #e7e5e4; padding-bottom: 0.5rem; }
    .article-body h3 { font-family: 'Playfair Display', serif; font-size: 1.2rem; font-weight: 600; margin: 2rem 0 0.5rem; color: #292524; }
    .article-body p { margin-bottom: 1.25rem; color: #292524; }
    .article-body ul, .article-body ol { margin: 1rem 0 1.5rem 1.5rem; }
    .article-body li { margin-bottom: 0.5rem; }
    .article-body strong { font-weight: 600; color: #1c1917; }
    .article-body em { font-style: italic; }
    .article-body hr { border: none; border-top: 2px solid #e7e5e4; margin: 2.5rem 0; }
    .article-body blockquote {
      border-left: 4px solid #c9a84c;
      padding: 0.5rem 0 0.5rem 1.5rem;
      margin: 1.5rem 0;
      font-style: italic;
      color: #57534e;
    }
    /* Download bar */
    .download-bar {
      max-width: 720px;
      margin: 0 auto 2rem;
      padding: 0 2rem;
    }
    .download-bar-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      background: #0c0a09;
      border-radius: 6px;
      padding: 1.25rem 1.5rem;
    }
    .download-info {
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      color: #a8a29e;
    }
    .download-info span { color: #faf9f7; font-weight: 600; }
    .btn-download {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: #c9a84c;
      color: #0c0a09;
      font-family: 'Inter', sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.625rem 1.25rem;
      border-radius: 4px;
      text-decoration: none;
      transition: background 0.15s;
      cursor: pointer;
    }
    .btn-download:hover { background: #dbbf5e; }
    /* Footer */
    .article-footer {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
      border-top: 1px solid #e7e5e4;
      font-family: 'Inter', sans-serif;
      font-size: 0.8rem;
      color: #a8a29e;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  </style>
</head>
<body>
  <header class="article-header">
    <div class="article-header-inner">
      <div class="site-tag">SubMoa Content</div>
      <h1 class="article-title">${escHtml(title)}</h1>
      <div class="article-meta">
        <strong>By ${escHtml(author)}</strong> · First-Person Field Review · SubMoa Content System
      </div>
    </div>
  </header>

  <div class="download-bar">
    <div class="download-bar-inner">
      <div class="download-info">
        <span>Ready to publish?</span> Download the clean text version of this article.
      </div>
      <a href="/api/download?path=/content/${slug}.md&format=txt" class="btn-download" download>
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Download .txt
      </a>
    </div>
  </div>

  <article class="article-body">
    ${body}
  </article>

  <footer class="article-footer">
    <span>Generated by SubMoa Content — submoacontent.com</span>
    <span>${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
  </footer>
</body>
</html>`;
}

function buildDocHtml(title: string, author: string, body: string): string {
  return `<!DOCTYPE html>
<html xmlns:word="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 1in; color: #000; }
  h1 { font-size: 20pt; font-weight: bold; margin: 18pt 0 6pt; page-break-after: avoid; }
  h2 { font-size: 14pt; font-weight: bold; margin: 14pt 0 4pt; border-bottom: 0.5pt solid #888; padding-bottom: 2pt; }
  h3 { font-size: 12pt; font-weight: bold; margin: 12pt 0 3pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 6pt 0 10pt 24pt; }
  li { margin: 3pt 0; }
  strong { font-weight: bold; }
  em { font-style: italic; }
  hr { border: none; border-top: 0.5pt solid #aaa; margin: 12pt 0; }
  .header { text-align: center; margin-bottom: 24pt; }
  .header h1 { font-size: 22pt; margin-bottom: 6pt; }
  .header .byline { font-size: 11pt; color: #555; border-top: 1pt solid #888; border-bottom: 0.5pt solid #888; padding: 4pt 0; margin-bottom: 18pt; }
</style>
</head>
<body>
<div class="header">
  <h1>${escHtml(title)}</h1>
  <div class="byline">By ${escHtml(author)}</div>
</div>
${body}
</body>
</html>`;
}

function escHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}