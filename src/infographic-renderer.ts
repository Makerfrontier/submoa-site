// src/infographic-renderer.ts
// SVG renderer for all five infographic layout types
// Called by infographic-assembler.ts after structured JSON is extracted

export interface InfographicData {
  headline: string;
  subheadline?: string;
  sections: Array<{
    label: string;
    value: string;
    context?: string;
    rank?: number;
    date?: string;
    subject?: "a" | "b";
  }>;
  subject_a?: string;
  subject_b?: string;
  cta?: string;
  source?: string;
}

export interface InfographicStyle {
  id: string;
  label: string;
  font_style?: string;
}

export interface InfographicRecord {
  infographic_type?: string;
  layout?: string;
  brand_colour?: string;
  output_format?: string;
  max_data_points?: number;
  cta_text?: string;
}

const DEFAULT_BRAND = "#c8973a";
const WIDTH = 800;

// ── Auto-detect type from data ────────────────────────────────────────────────

export function detectType(data: InfographicData): string {
  if (data.subject_a && data.subject_b) return "comparison";
  const hasNumbers = data.sections.some((s) => /^\d[\d.,% ]*$/.test(s.value.trim()));
  const hasDates = data.sections.some((s) => s.date);
  const hasRanks = data.sections.some((s) => typeof s.rank === "number");
  const hasSteps = data.sections.every((s, i) => {
    const n = parseInt(s.value);
    return !isNaN(n) && n === i + 1;
  });

  if (hasDates) return "timeline";
  if (hasRanks) return "list";
  if (hasSteps) return "process";
  if (hasNumbers) return "statistical";
  return "list";
}

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderInfographicSVG(
  data: InfographicData,
  style: InfographicStyle | null,
  record: InfographicRecord
): string {
  const brand = record.brand_colour ?? DEFAULT_BRAND;
  const type = record.infographic_type || detectType(data);

  switch (type) {
    case "statistical": return renderStatistical(data, brand);
    case "comparison":  return renderComparison(data, brand);
    case "list":        return renderList(data, brand);
    case "process":     return renderProcess(data, brand);
    case "timeline":    return renderTimeline(data, brand, record.layout ?? "vertical");
    default:            return renderList(data, brand);
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function accentBars(brand: string, totalHeight: number): string {
  return `
  <rect x="0" y="0" width="${WIDTH}" height="8" fill="${brand}"/>
  <rect x="0" y="${totalHeight - 8}" width="${WIDTH}" height="8" fill="${brand}"/>`;
}

function header(data: InfographicData, brand: string, y: number): { svg: string; height: number } {
  let svg = `
  <text x="60" y="${y + 44}" font-family="Georgia, serif" font-size="34" font-weight="700" fill="#ffffff">${esc(data.headline)}</text>`;
  let h = 64;
  if (data.subheadline) {
    svg += `
  <text x="60" y="${y + 70}" font-family="sans-serif" font-size="15" fill="#8aaa8a">${esc(data.subheadline)}</text>`;
    h = 90;
  }
  svg += `
  <line x1="60" y1="${y + h + 10}" x2="${WIDTH - 60}" y2="${y + h + 10}" stroke="${brand}" stroke-width="2"/>`;
  return { svg, height: h + 30 };
}

function footer(data: InfographicData, brand: string, y: number): { svg: string; height: number } {
  let svg = "";
  let h = 0;

  if (data.cta) {
    svg += `
  <rect x="60" y="${y + 16}" width="200" height="40" rx="6" fill="${brand}"/>
  <text x="160" y="${y + 41}" font-family="sans-serif" font-size="14" fill="#000000" text-anchor="middle" font-weight="600">${esc(data.cta)}</text>`;
    h += 72;
  }

  if (data.source) {
    svg += `
  <text x="${WIDTH / 2}" y="${y + h + 24}" font-family="sans-serif" font-size="10" fill="#3a5a3a" text-anchor="middle">Source: ${esc(data.source)}</text>`;
    h += 36;
  }

  return { svg, height: h + 20 };
}

function wrap(content: string, totalHeight: number, brand: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${totalHeight}" viewBox="0 0 ${WIDTH} ${totalHeight}">
  <rect width="${WIDTH}" height="${totalHeight}" fill="#0a1a0a"/>
  ${accentBars(brand, totalHeight)}
  ${content}
</svg>`;
}

// ── 1. Statistical ────────────────────────────────────────────────────────────

function renderStatistical(data: InfographicData, brand: string): string {
  const sections = data.sections.slice(0, 7);
  let y = 20;
  let content = "";

  // Header
  const h = header(data, brand, y);
  content += h.svg;
  y += h.height;

  // Hero stat — first section gets large treatment
  const hero = sections[0];
  if (hero) {
    content += `
  <rect x="60" y="${y}" width="${WIDTH - 120}" height="110" rx="8" fill="#0f200f" stroke="${brand}" stroke-width="0.5"/>
  <text x="${WIDTH / 2}" y="${y + 58}" font-family="Georgia, serif" font-size="52" font-weight="700" fill="${brand}" text-anchor="middle">${esc(hero.value)}</text>
  <text x="${WIDTH / 2}" y="${y + 86}" font-family="sans-serif" font-size="14" fill="#8aaa8a" text-anchor="middle">${esc(hero.label)}</text>
  ${hero.context ? `<text x="${WIDTH / 2}" y="${y + 102}" font-family="sans-serif" font-size="11" fill="#5a7a5a" text-anchor="middle">${esc(hero.context)}</text>` : ""}`;
    y += 126;
  }

  // Supporting stats grid — 2 or 3 columns
  const rest = sections.slice(1);
  const cols = rest.length <= 4 ? 2 : 3;
  const cellW = Math.floor((WIDTH - 120 - (cols - 1) * 16) / cols);
  const cellH = 90;

  rest.forEach((s, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 60 + col * (cellW + 16);
    const cy = y + row * (cellH + 12);

    content += `
  <rect x="${x}" y="${cy}" width="${cellW}" height="${cellH}" rx="6" fill="#0f200f" stroke="#1e3a1e" stroke-width="0.5"/>
  <text x="${x + cellW / 2}" y="${cy + 44}" font-family="Georgia, serif" font-size="28" font-weight="700" fill="${brand}" text-anchor="middle">${esc(s.value)}</text>
  <text x="${x + cellW / 2}" y="${cy + 64}" font-family="sans-serif" font-size="12" fill="#8aaa8a" text-anchor="middle">${esc(s.label)}</text>
  ${s.context ? `<text x="${x + cellW / 2}" y="${cy + 78}" font-family="sans-serif" font-size="10" fill="#5a7a5a" text-anchor="middle">${esc(s.context)}</text>` : ""}`;
  });

  const gridRows = Math.ceil(rest.length / cols);
  y += gridRows * (cellH + 12) + 16;

  const f = footer(data, brand, y);
  content += f.svg;
  y += f.height;

  return wrap(content, y + 20, brand);
}

// ── 2. Comparison ─────────────────────────────────────────────────────────────

function renderComparison(data: InfographicData, brand: string): string {
  const colW = (WIDTH - 160) / 2;
  const rowH = 70;
  let y = 20;
  let content = "";

  const h = header(data, brand, y);
  content += h.svg;
  y += h.height;

  // Column headers
  const subA = data.subject_a ?? "Option A";
  const subB = data.subject_b ?? "Option B";

  content += `
  <rect x="60" y="${y}" width="${colW}" height="48" rx="6" fill="${brand}"/>
  <text x="${60 + colW / 2}" y="${y + 29}" font-family="sans-serif" font-size="16" font-weight="700" fill="#000" text-anchor="middle">${esc(subA)}</text>
  <rect x="${60 + colW + 40}" y="${y}" width="${colW}" height="48" rx="6" fill="#1e3a1e" stroke="${brand}" stroke-width="0.5"/>
  <text x="${60 + colW + 40 + colW / 2}" y="${y + 29}" font-family="sans-serif" font-size="16" font-weight="700" fill="${brand}" text-anchor="middle">${esc(subB)}</text>`;
  y += 64;

  // Attribute rows
  data.sections.slice(0, 7).forEach((s, i) => {
    const isEven = i % 2 === 0;
    const bg = isEven ? "#0f200f" : "transparent";
    const labelX = 60 + colW + 20;

    content += `
  <rect x="60" y="${y}" width="${WIDTH - 120}" height="${rowH}" rx="4" fill="${bg}"/>
  <text x="${60 + colW / 2}" y="${y + rowH / 2 - 8}" font-family="sans-serif" font-size="22" font-weight="700" fill="${brand}" text-anchor="middle">${esc(s.value)}</text>
  <text x="${60 + colW / 2}" y="${y + rowH / 2 + 14}" font-family="sans-serif" font-size="12" fill="#8aaa8a" text-anchor="middle">${esc(s.label)}</text>
  <line x1="${labelX}" y1="${y + 16}" x2="${labelX}" y2="${y + rowH - 16}" stroke="#1e3a1e" stroke-width="0.5"/>
  <text x="${labelX + colW / 2}" y="${y + rowH / 2 + 6}" font-family="sans-serif" font-size="13" fill="#6a8a6a" text-anchor="middle">${esc(s.context ?? "—")}</text>`;
    y += rowH + 4;
  });

  y += 16;
  const f = footer(data, brand, y);
  content += f.svg;
  y += f.height;

  return wrap(content, y + 20, brand);
}

// ── 3. List / Ranking ─────────────────────────────────────────────────────────

function renderList(data: InfographicData, brand: string): string {
  const sections = data.sections.slice(0, 7);
  let y = 20;
  let content = "";

  const h = header(data, brand, y);
  content += h.svg;
  y += h.height;

  sections.forEach((s, i) => {
    const rank = i + 1;
    const isFirst = rank === 1;
    const rowH = isFirst ? 90 : 72;
    const bg = isFirst ? `${brand}22` : i % 2 === 0 ? "#0f200f" : "transparent";
    const border = isFirst ? `stroke="${brand}" stroke-width="0.5"` : `stroke="#1e3a1e" stroke-width="0.5"`;

    content += `
  <rect x="60" y="${y}" width="${WIDTH - 120}" height="${rowH}" rx="6" fill="${bg}" ${border}/>
  <text x="104" y="${y + rowH / 2 + (isFirst ? 10 : 6)}" font-family="Georgia, serif" font-size="${isFirst ? 36 : 28}" font-weight="700" fill="${brand}" text-anchor="middle" dominant-baseline="central">${rank}</text>
  <line x1="136" y1="${y + 16}" x2="136" y2="${y + rowH - 16}" stroke="${brand}" stroke-width="0.5" opacity="0.4"/>
  <text x="156" y="${y + (s.context ? rowH / 2 - 8 : rowH / 2 + 5)}" font-family="sans-serif" font-size="${isFirst ? 18 : 15}" font-weight="${isFirst ? "700" : "500"}" fill="${isFirst ? "#ffffff" : "#c8c8b8"}">${esc(s.label)}</text>
  ${s.context ? `<text x="156" y="${y + rowH / 2 + 14}" font-family="sans-serif" font-size="12" fill="#5a7a5a">${esc(s.context)}</text>` : ""}
  ${s.value && s.value !== s.label ? `<text x="${WIDTH - 80}" y="${y + rowH / 2 + 5}" font-family="Georgia, serif" font-size="20" font-weight="700" fill="${brand}" text-anchor="end">${esc(s.value)}</text>` : ""}`;
    y += rowH + 8;
  });

  y += 16;
  const f = footer(data, brand, y);
  content += f.svg;
  y += f.height;

  return wrap(content, y + 20, brand);
}

// ── 4. Process / How-To ───────────────────────────────────────────────────────

function renderProcess(data: InfographicData, brand: string): string {
  const sections = data.sections.slice(0, 7);
  const stepH = 88;
  let y = 20;
  let content = "";

  const h = header(data, brand, y);
  content += h.svg;
  y += h.height;

  sections.forEach((s, i) => {
    const isLast = i === sections.length - 1;
    const circleX = 96;
    const circleY = y + stepH / 2;

    // Connector line
    if (!isLast) {
      content += `
  <line x1="${circleX}" y1="${circleY + 24}" x2="${circleX}" y2="${circleY + stepH}" stroke="${brand}" stroke-width="2" opacity="0.4"/>`;
    }

    // Step circle
    content += `
  <circle cx="${circleX}" cy="${circleY}" r="22" fill="${brand}"/>
  <text x="${circleX}" y="${circleY + 7}" font-family="Georgia, serif" font-size="18" font-weight="700" fill="#000" text-anchor="middle">${i + 1}</text>`;

    // Step content box
    content += `
  <rect x="140" y="${y + 8}" width="${WIDTH - 220}" height="${stepH - 16}" rx="6" fill="#0f200f" stroke="#1e3a1e" stroke-width="0.5"/>
  <text x="164" y="${y + 36}" font-family="sans-serif" font-size="15" font-weight="600" fill="#ffffff">${esc(s.label)}</text>
  ${s.context ? `<text x="164" y="${y + 56}" font-family="sans-serif" font-size="12" fill="#6a8a6a">${esc(s.context)}</text>` : ""}
  ${s.value && s.value !== s.label ? `<text x="164" y="${y + 72}" font-family="sans-serif" font-size="11" fill="#c8973a" font-style="italic">${esc(s.value)}</text>` : ""}`;

    y += stepH + 8;
  });

  y += 16;
  const f = footer(data, brand, y);
  content += f.svg;
  y += f.height;

  return wrap(content, y + 20, brand);
}

// ── 5. Timeline ───────────────────────────────────────────────────────────────

function renderTimeline(data: InfographicData, brand: string, layout: string): string {
  const sections = data.sections.slice(0, 7);
  const isHorizontal = layout === "horizontal";
  let y = 20;
  let content = "";

  const h = header(data, brand, y);
  content += h.svg;
  y += h.height;

  if (isHorizontal) {
    // Horizontal timeline — axis runs left to right
    const axisY = y + 80;
    const totalW = WIDTH - 120;
    const step = totalW / (sections.length - 1 || 1);

    // Axis line
    content += `
  <line x1="60" y1="${axisY}" x2="${WIDTH - 60}" y2="${axisY}" stroke="${brand}" stroke-width="2" opacity="0.5"/>`;

    sections.forEach((s, i) => {
      const cx = 60 + i * step;
      const isAbove = i % 2 === 0;
      const textY = isAbove ? axisY - 40 : axisY + 50;
      const dateY = isAbove ? axisY - 20 : axisY + 70;

      content += `
  <circle cx="${cx}" cy="${axisY}" r="10" fill="${brand}"/>
  <line x1="${cx}" y1="${isAbove ? axisY - 10 : axisY + 10}" x2="${cx}" y2="${isAbove ? axisY - 28 : axisY + 28}" stroke="${brand}" stroke-width="1" opacity="0.5"/>
  <text x="${cx}" y="${textY}" font-family="sans-serif" font-size="12" font-weight="600" fill="#c8c8b8" text-anchor="middle">${esc(s.label)}</text>
  ${s.date ? `<text x="${cx}" y="${dateY}" font-family="sans-serif" font-size="10" fill="${brand}" text-anchor="middle">${esc(s.date)}</text>` : ""}`;
    });

    y = axisY + 100;
  } else {
    // Vertical timeline — axis runs top to bottom
    const axisX = 120;
    const rowH = 80;

    content += `
  <line x1="${axisX}" y1="${y}" x2="${axisX}" y2="${y + sections.length * rowH}" stroke="${brand}" stroke-width="2" opacity="0.3"/>`;

    sections.forEach((s, i) => {
      const cy = y + i * rowH + rowH / 2;

      content += `
  <circle cx="${axisX}" cy="${cy}" r="12" fill="${brand}"/>
  <text x="${axisX}" y="${cy + 5}" font-family="sans-serif" font-size="10" fill="#000" text-anchor="middle" font-weight="700">${i + 1}</text>
  ${s.date ? `<text x="${axisX + 30}" y="${cy - 10}" font-family="sans-serif" font-size="11" fill="${brand}">${esc(s.date)}</text>` : ""}
  <text x="${axisX + 30}" y="${cy + (s.date ? 8 : 5)}" font-family="sans-serif" font-size="14" font-weight="600" fill="#ffffff">${esc(s.label)}</text>
  ${s.context ? `<text x="${axisX + 30}" y="${cy + 24}" font-family="sans-serif" font-size="12" fill="#6a8a6a">${esc(s.context)}</text>` : ""}`;
    });

    y += sections.length * rowH + 16;
  }

  const f = footer(data, brand, y);
  content += f.svg;
  y += f.height;

  return wrap(content, y + 20, brand);
}
