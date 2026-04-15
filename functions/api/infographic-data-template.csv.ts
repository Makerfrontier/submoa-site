// ── CSV Template (serve as a static file download) ───────────────────────────
// Serve this from: GET /api/infographic-data-template.csv
// Or host as a static asset at /templates/infographic-data-template.csv

const CSV_TEMPLATE = `stat_label,value,context,source_url
"Example: Average shot distance","47 yards","Based on 2025 season data","https://example.com/source"
"Example: Hunters using optics","73%","Survey of 1200 hunters","https://example.com/survey"
"Example: Best caliber","6.5 Creedmoor","Most popular for long range","https://example.com/data"
`;

// Add this endpoint to your functions/api/ folder:
// GET /api/infographic-data-template.csv
export const onRequestGet = async () => {
  return new Response(CSV_TEMPLATE, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="infographic-data-template.csv"',
      "Cache-Control": "public, max-age=86400",
    },
  });
};
