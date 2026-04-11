const BRAND = {
  name: 'SubMoa Content',
  url: 'https://submoacontent.com',
  logoUrl: 'https://submoacontent.com/logo.jpg',
  tagline: 'AI-Crafted Adventure for Hunters & Shooters',
  accent: '#b8922e',
  accentBright: '#d4a83c',
  hunter: '#0a150a',
  hunterMid: '#111c11',
  hunterLight: '#182418',
  border: '#253025',
  cream: '#ede8df',
  creamDim: '#b8b0a0',
  brown: '#1a1410',
}

function baseTemplate({ title, bodyContent, preview }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <!--[if mso]><style type="text/css">body, table, td {font-family: Georgia, serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.hunter};font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.hunter};padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.hunterMid};border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden;">

          <!-- HEADER -->
          <tr>
            <td style="background:${BRAND.hunter};border-bottom:3px solid ${BRAND.accent};padding:2rem 2.5rem 1.75rem;text-align:center;">
              <img src="${BRAND.logoUrl}" alt="${BRAND.name}" width="80" height="80" style="border-radius:50%;margin-bottom:0.75rem;" />
              <p style="font-family:sans-serif;font-size:0.6875rem;letter-spacing:0.15em;text-transform:uppercase;color:${BRAND.accentBright};margin:0;">${BRAND.tagline}</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="padding:2.5rem 2.5rem 2rem;color:${BRAND.creamDim};">
              ${bodyContent}
            </td>
          </tr>

          <!-- DIVIDER -->
          <tr>
            <td style="padding:0 2.5rem;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid ${BRAND.border};"></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:1.5rem 2.5rem;text-align:center;">
              <p style="font-family:sans-serif;font-size:0.6875rem;color:${BRAND.hunter};margin:0;opacity:0.6;">${BRAND.name} &mdash; Mombasa to Montana, Est. 1927</p>
              <p style="font-family:sans-serif;font-size:0.625rem;color:${BRAND.border};margin:0.5rem 0 0;">${BRAND.url}</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function h1(text) {
  return `<h1 style="font-family:Georgia,serif;font-size:1.375rem;font-weight:normal;color:${BRAND.cream};margin:0 0 1rem;line-height:1.4;">${text}</h1>`
}

function p(text) {
  return `<p style="font-family:Georgia,serif;font-size:0.9375rem;line-height:1.7;color:${BRAND.creamDim};margin:0 0 1rem;">${text}</p>`
}

function strong(text) {
  return `<strong style="color:${BRAND.cream};">${text}</strong>`
}

function cta(text, href) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:1.5rem 0;">
  <tr>
    <td style="background:${BRAND.accent};border-radius:2px;padding:0.875rem 2rem;">
      <a href="${href}" style="font-family:sans-serif;font-size:0.75rem;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;color:${BRAND.hunter};display:block;">${text}</a>
    </td>
  </tr>
</table>`
}

function metaRow(label, value) {
  return `<p style="font-family:sans-serif;font-size:0.8125rem;color:${BRAND.creamDim};margin:0 0 0.5rem;">${label}: <span style="color:${BRAND.cream};">${value}</span></p>`
}

// ─── Registration confirmation ─────────────────────────────────────────
export function registrationEmail({ name, email, loginUrl }) {
  const body = `
    ${h1(`Welcome, ${name || 'Hunter'}.`)}
    ${p(`Your access is confirmed. You're in position to start submitting article briefs and receiving content crafted for the hunting and shooting community.`)}
    ${p(`Your submitter account is active. Here's your reference:`)}
    ${metaRow('Email', email)}
    ${p(`If you ever lose access, use the password reset flow — we'll get you back in.`)}
    ${cta('Submit Your First Brief', loginUrl || `${BRAND.url}/author`)}
  `
  return {
    subject: `You're in — welcome to SubMoa Content`,
    html: baseTemplate({ title: `Welcome to SubMoa Content`, bodyContent: body }),
  }
}

// ─── Article request confirmation ─────────────────────────────────────
export function articleRequestEmail({ name, topic, articleFormat, submissionId, dashboardUrl }) {
  const formatLabels = {
    'seo-blog': 'SEO Blog Post',
    'gear-review': 'Gear Review',
    'field-guide': 'Field Guide',
    'product-comparison': 'Product Comparison',
  }
  const formatLabel = formatLabels[articleFormat] || articleFormat

  const body = `
    ${h1(`Brief received.`)}
    ${p(`${name || 'Hunter'}, your request is in the queue. We'll have your content ready within 48 hours.`)}
    ${metaRow('Topic', topic)}
    ${metaRow('Format', formatLabel)}
    ${p(`You'll receive a notification when it's available in your dashboard.`)}
    ${cta('Track Your Briefs', dashboardUrl || `${BRAND.url}/dashboard`)}
  `
  return {
    subject: `Brief received — ${topic}`,
    html: baseTemplate({ title: `Brief received`, bodyContent: body }),
  }
}

// ─── Article delivery ──────────────────────────────────────────────────
export function articleDeliveryEmail({ name, topic, articleLink, dashboardUrl }) {
  const body = `
    ${h1(`Your article is ready.`)}
    ${p(`${name || 'Hunter'}, the wait is over. Your article on <strong>${topic}</strong> is complete and waiting in your dashboard.`)}
    ${p(`Each piece is reviewed for accuracy, formatted for your audience, and ready to publish.`)}
    ${cta('Pick Up Your Article', articleLink || `${BRAND.url}/dashboard`)}
    ${p(`Need revisions? Submit a revision request from your dashboard and we'll address it directly.`)}
  `
  return {
    subject: `Your article is ready — ${topic}`,
    html: baseTemplate({ title: `Your article is ready`, bodyContent: body }),
  }
}

// ─── Password reset ───────────────────────────────────────────────────
export function passwordResetEmail({ name, resetUrl }) {
  const body = `
    ${h1(`Reset your password.`)}
    ${p(`${name || 'Hunter'}, click the button below to set a new password. The link expires in 30 minutes and can only be used once.`)}
    ${cta('Reset Password', resetUrl)}
    ${p(`If you didn't request this, ignore this message. Nothing has changed on your account.`)}
  `
  return {
    subject: `Reset your SubMoa Content password`,
    html: baseTemplate({ title: `Reset your password`, bodyContent: body }),
  }
}

// ─── Shared send helper ────────────────────────────────────────────────
export async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `SubMoa Content <onboarding@resend.dev>`,
      to,
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error: ${body}`)
  }
  return res.json()
}
