const EMAIL_LAYOUT_MARKER = "data-goreb-email-layout";
const LEGACY_EMAIL_LAYOUT_MARKER = "data-eduportal-email-layout";

const applyEmailLayout = (content) => {
  const html = String(content || "");
  if (html.includes(EMAIL_LAYOUT_MARKER) || html.includes(LEGACY_EMAIL_LAYOUT_MARKER)) return html;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Goreb</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#243247;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table ${EMAIL_LAYOUT_MARKER} role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;border-collapse:separate;border-spacing:0;background-color:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #1e3a5f;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:0;">
                ${html}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px;border-top:1px solid #e8edf3;color:#718096;font-size:12px;line-height:18px;">
                Goreb &nbsp;|&nbsp; School management portal
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

module.exports = { applyEmailLayout };
