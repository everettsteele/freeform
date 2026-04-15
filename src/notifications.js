const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function notifyNewSubmission(formTitle, formSlug, data) {
  const fromEmail = process.env.FROM_EMAIL || 'everett@neverstill.llc';
  const toEmail = process.env.NOTIFY_EMAIL || fromEmail;

  const fieldRows = Object.values(data)
    .map(field => `<tr><td style="padding:6px 12px;font-weight:600;">${field.label}</td><td style="padding:6px 12px;">${Array.isArray(field.value) ? field.value.join(', ') : (field.value || '—')}</td></tr>`)
    .join('');

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="margin-bottom:4px;">New submission: ${formTitle}</h2>
      <p style="color:#666;margin-top:0;">Form: <code>${formSlug}</code></p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e8e5e0;border-radius:6px;">
        <tbody>${fieldRows}</tbody>
      </table>
      <p style="color:#999;font-size:12px;margin-top:16px;">Sent by Freeform — forms.neverstill.llc</p>
    </div>
  `;

  await resend.emails.send({
    from: `Freeform <${fromEmail}>`,
    to: toEmail,
    subject: `New submission: ${formTitle}`,
    html
  });
}

module.exports = { notifyNewSubmission };
