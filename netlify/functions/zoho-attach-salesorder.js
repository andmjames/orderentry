// Attach a PDF (e.g. the packing list) to a Zoho Inventory sales order.
const { zohoUpload, headers, checkEnv } = require('./zoho-utils');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    checkEnv();
    const body = JSON.parse(event.body || '{}');
    const salesorder_id = body.salesorder_id;
    const filename      = body.filename;
    const fileB64       = body.file_base64 || body.pdf_base64;
    const contentType   = body.content_type || 'application/pdf';
    if (!salesorder_id || !fileB64) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'salesorder_id and file_base64 required' }) };
    }

    const buffer = Buffer.from(fileB64, 'base64');
    const result = await zohoUpload(`/salesorders/${salesorder_id}/attachment`, {
      fieldName: 'attachment',
      filename: filename || 'attachment.pdf',
      buffer,
      contentType,
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: result.message || null }) };
  } catch (err) {
    console.error('zoho-attach-salesorder error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
