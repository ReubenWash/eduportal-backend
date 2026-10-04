const { prisma } = require("../config/db");
const { sendMailSafe } = require("./email.service");

const CLIENT_URL = () => process.env.CLIENT_URL || "http://localhost:5173";
const ADMIN_BILLING_PATH = () => process.env.ADMIN_BILLING_PATH || "/admin/subscriptions";

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (amount, currency = "GHS") => `${currency} ${Number(amount).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => new Date(d).toISOString().slice(0, 10);

const layout = (title, color, body, button) => `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#1A3C5E;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:24px;">EduPortal</h1>
    </div>
    <div style="padding:32px;background:#f9f9f9;">
      <h2 style="color:${color};">${esc(title)}</h2>
      <div style="color:#444;line-height:1.6;font-size:15px;">${body}</div>
      ${button ? `<div style="text-align:center;margin:28px 0;"><a href="${esc(button.url)}" style="background:${color};color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">${esc(button.label)}</a></div>` : ""}
    </div>
  </div>`;

// Every active SUPER_ADMIN plus anything in ADMIN_NOTIFY_EMAILS (comma separated).
const getAdminEmails = async () => {
  const admins = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { email: true } });
  const extra = (process.env.ADMIN_NOTIFY_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
  return [...new Set([...admins.map((a) => a.email), ...extra])];
};

const toAdmins = async (subject, html) => {
  try {
    const emails = await getAdminEmails();
    await Promise.all(emails.map((to) => sendMailSafe({ to, subject, html })));
  } catch (e) {
    console.warn("Admin notification failed (non-blocking):", e.message);
  }
};

// "New school registered: Greenfield Academy"
const notifyAdminsNewSchool = ({ schoolName, region, district, gesNumber, email, phone, headmasterName }) =>
  toAdmins(
    `New school registered: ${schoolName}`,
    layout("New school awaiting approval", "#2E75B6", `
      <p><strong>${esc(schoolName)}</strong> has registered and is waiting for your approval.</p>
      <p>Headmaster: ${esc(headmasterName)}<br/>Email: ${esc(email)}<br/>Phone: ${esc(phone || "—")}<br/>
      Location: ${esc(district)}, ${esc(region)}<br/>GES number: ${esc(gesNumber || "not provided")}</p>
      <p>Verify the school is real before approving.</p>`,
      { label: "Review schools", url: `${CLIENT_URL()}/admin/schools` })
  );

// "Payment proof submitted — GOR-2026-A1B2"
const notifyAdminsPaymentSubmitted = (p) =>
  toAdmins(
    `Payment proof submitted — ${p.reference}`,
    layout("Payment proof submitted", "#2E75B6", `
      <p><strong>${esc(p.schoolName)}</strong> submitted proof of payment.</p>
      <p>Reference: <strong>${esc(p.reference)}</strong><br/>
      Amount expected: <strong>${money(p.amountExpected, p.currency)}</strong> (${p.studentCount} students × ${money(p.pricePerStudent, p.currency)} × ${p.months} month${p.months > 1 ? "s" : ""})<br/>
      Method: ${esc(p.method === "MOMO" ? "Mobile Money" : "Bank transfer")}<br/>
      Paid on: ${day(p.paidOn)}<br/>Payer: ${esc(p.payerName || "—")} ${esc(p.payerPhone || "")}<br/>
      Transaction ref: ${esc(p.transactionRef || "—")}</p>
      <p>Check the MoMo / bank notification matches before approving.</p>`,
      { label: "Review payment", url: `${CLIENT_URL()}${ADMIN_BILLING_PATH()}` })
  );

const sendPaymentReceivedEmail = (to, p) =>
  sendMailSafe({
    to,
    subject: `We received your payment proof — ${p.reference}`,
    html: layout("Payment proof received", "#2E75B6", `
      <p>Thank you. We received your proof of payment for <strong>${esc(p.schoolName)}</strong>.</p>
      <p>Reference: <strong>${esc(p.reference)}</strong><br/>Amount: ${money(p.amountExpected, p.currency)}</p>
      <p>We will verify it and confirm by email shortly.</p>`),
  });

// "Payment approved — your plan is active until 2026-11-04"
const sendPaymentApprovedEmail = (to, p) =>
  sendMailSafe({
    to,
    subject: `Payment approved — your plan is active until ${day(p.periodEnd)}`,
    html: layout("Payment approved", "#27AE60", `
      <p>Your payment for <strong>${esc(p.schoolName)}</strong> has been approved.</p>
      <p>Reference: <strong>${esc(p.reference)}</strong><br/>
      Your plan is active until <strong>${day(p.periodEnd)}</strong>.</p>`,
      { label: "Go to dashboard", url: `${CLIENT_URL()}/login` }),
  });

const sendPaymentRejectedEmail = (to, p) =>
  sendMailSafe({
    to,
    subject: `Payment could not be verified — ${p.reference}`,
    html: layout("Payment not approved", "#C0392B", `
      <p>We could not verify the payment for <strong>${esc(p.schoolName)}</strong>.</p>
      <p>Reference: <strong>${esc(p.reference)}</strong><br/>Reason: ${esc(p.rejectionReason)}</p>
      <p>Please check the details and submit a new proof of payment from the Billing page.</p>`,
      { label: "Open billing", url: `${CLIENT_URL()}/billing` }),
  });

module.exports = {
  notifyAdminsNewSchool,
  notifyAdminsPaymentSubmitted,
  sendPaymentReceivedEmail,
  sendPaymentApprovedEmail,
  sendPaymentRejectedEmail,
};