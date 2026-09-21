import { BRAND, SANS_STACK, escapeHtml, sanitizeUrl } from './utils';

const METHOD_LABELS: Record<string, string> = {
  upi: 'UPI',
  payment_link: 'Payment Link',
  paypal: 'PayPal',
  wise: 'Wise',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
};

export function renderMethodDetailsHtml(method: any): string {
  const label = METHOD_LABELS[method.type] || escapeHtml(method.type);
  const linkStyle = `color: ${BRAND.primary}; font-weight: 500; word-break: break-all; text-decoration: underline; text-underline-offset: 3px;`;
  const rowStyle = `margin: 4px 0; font-family: ${SANS_STACK}; font-size: 14px; color: ${BRAND.ink};`;
  const labelStyle = `font-family: ${SANS_STACK}; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: ${BRAND.inkSoft}; font-weight: 600;`;

  let detailsHtml = '';
  switch (method.type) {
    case 'upi':
      detailsHtml = `<p style="${rowStyle}"><span style="${labelStyle}">UPI ID</span><br/>${escapeHtml(method.upi_id) || ''}</p>`;
      if (method.display_name) {
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">Name</span><br/>${escapeHtml(method.display_name)}</p>`;
      }
      if (method.qr_code_url) {
        detailsHtml += `<div style="text-align: center; margin: 12px 0;"><img src="${sanitizeUrl(method.qr_code_url)}" alt="UPI QR Code" style="max-width: 200px; border: 1px solid ${BRAND.rule};" /></div>`;
      }
      break;
    case 'payment_link':
      if (method.url) {
        detailsHtml = `<p style="${rowStyle}"><a href="${sanitizeUrl(method.url)}" target="_blank" style="${linkStyle}">${escapeHtml(method.url)}</a></p>`;
      }
      break;
    case 'paypal':
      if (method.paypal_link) {
        detailsHtml = `<p style="${rowStyle}"><a href="${sanitizeUrl(method.paypal_link)}" target="_blank" style="${linkStyle}">${escapeHtml(method.paypal_link)}</a></p>`;
      }
      if (method.email) {
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">PayPal Email</span><br/>${escapeHtml(method.email)}</p>`;
      }
      break;
    case 'wise':
      if (method.email) {
        detailsHtml = `<p style="${rowStyle}"><span style="${labelStyle}">Wise Email</span><br/>${escapeHtml(method.email)}</p>`;
      }
      break;
    case 'bank_transfer':
      if (method.bank_name)
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">Bank</span><br/>${escapeHtml(method.bank_name)}</p>`;
      if (method.account_holder)
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">Account Holder</span><br/>${escapeHtml(method.account_holder)}</p>`;
      if (method.account_number)
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">Account Number</span><br/>${escapeHtml(method.account_number)}</p>`;
      if (method.ifsc)
        detailsHtml += `<p style="${rowStyle}"><span style="${labelStyle}">IFSC / Routing</span><br/>${escapeHtml(method.ifsc)}</p>`;
      break;
    case 'cash':
      detailsHtml = `<p style="${rowStyle}">Cash payment to be collected in person.</p>`;
      break;
  }

  const instructionsHtml = method.instructions
    ? `<div style="margin-top: 10px; padding: 10px 12px; background: ${BRAND.cream}; font-family: ${SANS_STACK}; font-size: 13px; color: ${BRAND.inkSoft}; line-height: 1.5;">${escapeHtml(method.instructions)}</div>`
    : '';

  return `
    <div style="background: ${BRAND.white}; border: 1px solid ${BRAND.rule}; padding: 16px 20px; margin-bottom: 12px;">
      <p style="margin: 0 0 10px 0; font-family: ${SANS_STACK}; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 600; color: ${BRAND.primary};">${label}</p>
      ${detailsHtml}
      ${instructionsHtml}
    </div>
  `;
}
