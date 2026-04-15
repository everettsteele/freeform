const { Resend } = require('resend');

// Fire-and-forget email notification for new form submissions.
// Requires RESEND_API_KEY and NOTIFY_EMAIL env vars.
async function notifyNewSubmission(formTitle, formSlug, data) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_EMAIL;
  if (!apiKey || !toEmail) return; // silently skip if not configured

  const resend = new Resend(apiKey);

  const rows = Object.entries(data)
    .map(([key, obj]) => {
      const label = obj.label || key;
      const val = Array.isArray(obj.value) ? obj.value.join(', ') : (obj.value || '');
      return `<tr><td style="padding:6px 12px;font-size:13px;color:#555;white-space:nowrap;border-bottom:1px solid #f0f0f0">${label}</td><td style="padding:6px 12px;font-size:13px;color:#111;border-bottom:1px solid #f0f0f0">${val}</td></tr>`;
    })
    .join('');

  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="font-size:18px;margin-bottom:4px">New submission: ${formTitle}</h2>
      <p style="font-size:12px;color:#888;margin-bottom:20px">Form: ${formSlug}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden">
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  await resend.emails.send({
    from: 'Freeform <noreply@neverstill.llc>',
    to: [toEmail],
    subject: `New submission: ${formTitle}`,
    html,
  });
}

module.exports = { notifyNewSubmission };
