/**
 * ═══════════════════════════════════════════════════════════════════
 *  WALLITUDE — Google Apps Script Backend
 *  Deploy as: Web App → Execute as: Me → Access: Anyone
 * ═══════════════════════════════════════════════════════════════════
 *
 *  SETUP STEPS:
 *  1. Open https://script.google.com → New project
 *  2. Paste this entire file
 *  3. Update SPREADSHEET_ID and ROOT_FOLDER_ID below
 *  4. Click Deploy → New deployment → Web App
 *     - Execute as: Me
 *     - Who has access: Anyone
 *  5. Copy the web app URL and paste into js/checkout.js → GAS_URL
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Configuration ────────────────────────────────────────────────
// Replace these with your actual Google Drive folder and Sheet IDs

/** Google Sheet ID — create a blank sheet, copy ID from the URL */
const SPREADSHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';

/**
 * Google Drive folder ID for all orders.
 * Create a folder called "Wallitude Orders" in Drive,
 * then copy its ID from the URL.
 */
const ROOT_FOLDER_ID = 'REPLACE_WITH_YOUR_DRIVE_FOLDER_ID';

/** Sheet tab name (auto-created if it doesn't exist) */
const SHEET_NAME = 'Orders';

// ── Header columns for the sheet ────────────────────────────────
const SHEET_HEADERS = [
  'Order ID', 'Payment ID', 'Payment Status', 'Timestamp',
  'Customer Name', 'Phone', 'Email',
  'Address', 'City', 'State', 'Pincode',
  'Items Count', 'Total Amount (₹)',
  'Layouts', 'Sizes', 'Text Lines',
  'Image Count (Total)',
  'Preview Folder URL', 'Images Folder URL'
];

// ════════════════════════════════════════════════════════════════
//  ENTRY POINT — handles POST requests from frontend
// ════════════════════════════════════════════════════════════════
function doPost(e) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // Parse incoming JSON payload
    const payload = JSON.parse(e.postData.contents);
    const result  = processOrder(payload);

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, orderId: result.orderId }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Allow OPTIONS preflight (CORS)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Wallitude GAS is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
//  PROCESS ORDER
// ════════════════════════════════════════════════════════════════
function processOrder(payload) {
  const orderId = payload.orderId || generateOrderId();

  // 1. Create Drive folder structure
  const folderUrls = createOrderFolders(orderId, payload);

  // 2. Log to Google Sheet
  logToSheet(payload, orderId, folderUrls);

  // 3. Send confirmation email (optional — remove if not needed)
  if (payload.customer && payload.customer.email) {
    sendConfirmationEmail(payload, orderId);
  }

  return { orderId, folderUrls };
}

// ════════════════════════════════════════════════════════════════
//  DRIVE FOLDER STRUCTURE
//  📁 Wallitude Orders/
//    📁 WT-XXXXX (Order ID)/
//      📁 Images/      ← uploaded source images
//      📁 Preview/     ← rendered preview PNGs
// ════════════════════════════════════════════════════════════════
function createOrderFolders(orderId, payload) {
  const rootFolder  = DriveApp.getFolderById(ROOT_FOLDER_ID);

  // Create order folder
  const orderFolder   = rootFolder.createFolder(orderId);
  const imagesFolder  = orderFolder.createFolder('Images');
  const previewFolder = orderFolder.createFolder('Preview');

  // Save preview images (base64 PNG from canvas)
  if (payload.items && payload.items.length > 0) {
    payload.items.forEach((item, idx) => {
      if (item.preview) {
        saveBase64Image(
          previewFolder,
          `preview_${idx + 1}.png`,
          item.preview
        );
      }
    });
  }

  // Note: Source image files are uploaded as base64 if passed
  // For large files, consider a separate upload endpoint
  if (payload.imageFiles) {
    payload.imageFiles.forEach((fileData, idx) => {
      if (fileData && fileData.base64 && fileData.name) {
        saveBase64Image(imagesFolder, fileData.name, fileData.base64);
      }
    });
  }

  return {
    orderFolder:  orderFolder.getUrl(),
    imagesFolder: imagesFolder.getUrl(),
    previewFolder: previewFolder.getUrl()
  };
}

// ── Save a base64-encoded image to a Drive folder ─────────────
function saveBase64Image(folder, filename, base64DataUrl) {
  try {
    // Strip the data: URL prefix if present
    const base64 = base64DataUrl.includes(',')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;

    const decoded = Utilities.base64Decode(base64);
    const blob    = Utilities.newBlob(decoded, 'image/png', filename);
    folder.createFile(blob);
  } catch (err) {
    Logger.log('saveBase64Image error for ' + filename + ': ' + err);
  }
}

// ════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS LOGGING
// ════════════════════════════════════════════════════════════════
function logToSheet(payload, orderId, folderUrls) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_NAME);

  // Auto-create sheet + headers if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
    // Bold header row
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#121212')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  const c       = payload.customer || {};
  const items   = payload.items    || [];

  // Aggregate item details
  const layouts     = items.map(i => `Layout ${i.layout}`).join(', ');
  const sizes       = items.map(i => i.size).join(', ');
  const textLines   = items.map(i => [i.textLine1, i.textLine2a, i.textLine2b].filter(Boolean).join(' | ')).join(' / ');
  const totalImages = items.reduce((s, i) => s + (i.imageCount || 0), 0);

  const row = [
    orderId,
    payload.paymentId    || '',
    payload.paymentStatus || 'PENDING',
    payload.timestamp     || new Date().toISOString(),
    c.name    || '',
    c.phone   || '',
    c.email   || '',
    c.address || '',
    c.city    || '',
    c.state   || '',
    c.pincode || '',
    items.length,
    payload.totalAmount || 0,
    layouts,
    sizes,
    textLines,
    totalImages,
    folderUrls ? folderUrls.previewFolder : '',
    folderUrls ? folderUrls.imagesFolder  : ''
  ];

  sheet.appendRow(row);

  // Auto-resize columns for readability
  try { sheet.autoResizeColumns(1, SHEET_HEADERS.length); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
//  OPTIONAL: CONFIRMATION EMAIL
//  Remove or customize as needed
// ════════════════════════════════════════════════════════════════
function sendConfirmationEmail(payload, orderId) {
  try {
    const c       = payload.customer;
    const items   = payload.items || [];
    const total   = payload.totalAmount || 0;

    const itemsHtml = items.map((item, i) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">Layout ${item.layout} · ${item.size}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">₹${(item.price||0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const html = `
      <div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;color:#121212">
        <div style="background:#121212;padding:20px 28px">
          <h1 style="color:#fff;font-size:18px;font-weight:300;letter-spacing:6px;margin:0">WALLITUDE</h1>
        </div>
        <div style="padding:32px 28px">
          <h2 style="font-size:20px;margin-bottom:6px">Order Confirmed 🎉</h2>
          <p style="color:#777;font-size:14px">Hi ${c.name},</p>
          <p style="color:#777;font-size:14px">Your custom frame order has been received. We'll begin crafting it right away.</p>

          <div style="background:#f6f3ee;border-radius:8px;padding:16px;margin:24px 0;font-size:13px">
            <strong>Order ID:</strong> ${orderId}<br>
            <strong>Payment ID:</strong> ${payload.paymentId || 'N/A'}
          </div>

          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <thead>
              <tr style="background:#f6f3ee">
                <th style="padding:10px 12px;text-align:left;font-weight:600">Item</th>
                <th style="padding:10px 12px;text-align:right;font-weight:600">Price</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
            <tfoot>
              <tr>
                <td style="padding:12px;font-weight:700">Total</td>
                <td style="padding:12px;text-align:right;font-weight:700">₹${total.toLocaleString('en-IN')}</td>
              </tr>
            </tfoot>
          </table>

          <div style="margin-top:24px;font-size:13px;color:#777">
            <p><strong>Delivery to:</strong><br>
            ${c.address}, ${c.city}, ${c.state} — ${c.pincode}</p>
            <p style="margin-top:8px">Expected delivery: <strong>5–7 business days</strong></p>
          </div>

          <p style="margin-top:28px;font-size:12px;color:#aaa">
            Questions? Email us at info@wallitude.com<br>
            Instagram: @wallitude.co
          </p>
        </div>
      </div>
    `;

    MailApp.sendEmail({
      to:      c.email,
      subject: `Your Wallitude Order is Confirmed — ${orderId}`,
      htmlBody: html,
      name:    'Wallitude'
    });

  } catch (err) {
    Logger.log('sendConfirmationEmail error: ' + err);
    // Non-fatal
  }
}

// ── Fallback order ID generator (matches frontend logic) ────────
function generateOrderId() {
  const chars  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand   = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `WT-${Date.now().toString(36).toUpperCase()}-${rand}`;
}
