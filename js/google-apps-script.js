/**
 * ═══════════════════════════════════════════════════════════════════
 *  WALLITUDE — Google Apps Script Backend  (v2 — Fixed)
 *  Deploy as: Web App → Execute as: Me → Who has access: Anyone
 * ═══════════════════════════════════════════════════════════════════
 *
 *  SETUP:
 *  1. Paste this file into https://script.google.com
 *  2. Fill in SPREADSHEET_ID, ROOT_FOLDER_ID, CALLMEBOT_PHONE, CALLMEBOT_APIKEY
 *  3. Deploy → New deployment → Web App → Execute as: Me → Anyone
 *  4. Copy the Web App URL → paste into js/checkout.js → GAS_URL
 *  5. Every time you edit this file you must create a NEW deployment
 *     (Deploy → New deployment) — editing an existing one doesn't update the live URL.
 * ═══════════════════════════════════════════════════════════════════
 */

// ── YOUR CONFIG — fill these in ──────────────────────────────────

/** ID from the URL of your Google Sheet: /spreadsheets/d/ID/edit */
const SPREADSHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';

/** ID from the URL of your "Wallitude Orders" Drive folder */
const ROOT_FOLDER_ID = 'REPLACE_WITH_YOUR_DRIVE_FOLDER_ID';

/**
 * CallMeBot WhatsApp (FREE business notifications to YOUR number).
 * Setup (one-time, 2 minutes):
 *   1. Save +34 644 59 77 59 in your phone as "CallMeBot"
 *   2. Send this WhatsApp message to that number:  I allow callmebot to send me messages
 *   3. You'll receive an API key in reply
 *   4. Fill in your number and the key below
 */
const CALLMEBOT_PHONE  = 'REPLACE_WITH_YOUR_WHATSAPP_NUMBER';  // e.g. '916287656368'
const CALLMEBOT_APIKEY = 'REPLACE_WITH_CALLMEBOT_API_KEY';     // e.g. '1234567'

/** Name of the sheet tab (must match exactly what you created) */
const SHEET_NAME = 'Orders';

/**
 * Column order — must match your existing sheet exactly.
 * Your sheet columns:
 * A: Order ID | B: Order Date | C: Order Status | D: Customer Name
 * E: Phone Number | F: Email | G: Full Address | H: State | I: City
 * J: Pincode | K: Order Value | L: Payment Status | M: Layout
 * N: Size | O: Quantity | P: Text Option
 */
const SHEET_HEADERS = [
  'Order ID', 'Order Date', 'Order Status',
  'Customer Name', 'Phone Number', 'Email', 'Full Address',
  'State', 'City', 'Pincode',
  'Order Value', 'Payment Status',
  'Layout', 'Size', 'Quantity', 'Text Option'
];

// ════════════════════════════════════════════════════════════════
//  doPost — called by frontend after Razorpay payment succeeds
//  Receives FormData with field "payload" containing JSON string
// ════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    // ⚠️  Frontend sends FormData (not JSON body) because no-cors mode
    //     requires it. Parse from e.parameter.payload.
    let payload;
    if (e.parameter && e.parameter.payload) {
      payload = JSON.parse(e.parameter.payload);
    } else if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      throw new Error('No payload received');
    }

    const result = processOrder(payload);

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

// ════════════════════════════════════════════════════════════════
//  doGet — serves two purposes:
//  1. Health check: ?action=ping  → returns status
//  2. Order tracking: ?action=track&orderId=WT-XXXXX → returns status
// ════════════════════════════════════════════════════════════════
function doGet(e) {
  const action  = e.parameter && e.parameter.action;
  const orderId = e.parameter && e.parameter.orderId;

  // ── Tracking query ──────────────────────────────────────────
  if (action === 'track' && orderId) {
    try {
      const result = trackOrder(orderId.trim().toUpperCase());
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService
        .createTextOutput(JSON.stringify({ found: false, error: err.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // ── Default health check ────────────────────────────────────
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'Wallitude GAS v2 is running', timestamp: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════════════════════════════════
//  TRACK ORDER — find order in sheet and return status
// ════════════════════════════════════════════════════════════════
function trackOrder(orderId) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) return { found: false, message: 'Orders sheet not found' };

  const data = sheet.getDataRange().getValues();

  // Row 0 is header, data starts at row 1
  for (let i = 1; i < data.length; i++) {
    const rowOrderId = String(data[i][0]).trim().toUpperCase();
    if (rowOrderId === orderId) {
      return {
        found:       true,
        orderId:     data[i][0],   // Col A
        orderDate:   data[i][1],   // Col B
        status:      data[i][2],   // Col C — Order Status
        customerName:data[i][3],   // Col D
        layout:      data[i][12],  // Col M
        size:        data[i][13],  // Col N
        quantity:    data[i][14],  // Col O
        orderValue:  data[i][10],  // Col K
        textOption:  data[i][15]   // Col P
      };
    }
  }

  return { found: false, message: 'Order not found. Please check your Order ID.' };
}

// ════════════════════════════════════════════════════════════════
//  PROCESS ORDER — orchestrates all steps
// ════════════════════════════════════════════════════════════════
function processOrder(payload) {
  const orderId = payload.orderId || generateOrderId();

  // 1. Create Drive folders + save images & preview
  const folderUrls = createOrderFolders(orderId, payload);

  // 2. Write row to Google Sheet
  logToSheet(payload, orderId, folderUrls);

  // 3. Send customer confirmation email
  if (payload.customer && payload.customer.email) {
    sendConfirmationEmail(payload, orderId);
  }

  // 4. Send WhatsApp notification to business (Wallitude)
  sendBusinessWhatsApp(payload, orderId);

  return { orderId, folderUrls };
}

// ════════════════════════════════════════════════════════════════
//  DRIVE FOLDER STRUCTURE
//  📁 Wallitude Orders /
//    📁 WT-XXXXX /
//      📁 Images /    ← original uploaded photos
//      📁 Preview /   ← rendered canvas preview PNGs
// ════════════════════════════════════════════════════════════════
function createOrderFolders(orderId, payload) {
  const rootFolder   = DriveApp.getFolderById(ROOT_FOLDER_ID);
  const orderFolder  = rootFolder.createFolder(orderId);
  const imagesFolder = orderFolder.createFolder('Images');
  const previewFolder= orderFolder.createFolder('Preview');

  const items = payload.items || [];

  items.forEach((item, idx) => {
    // Save the rendered preview (canvas PNG)
    if (item.preview) {
      saveBase64Image(previewFolder, `preview_item${idx + 1}.png`, item.preview);
    }

    // Save each individual uploaded photo
    if (item.uploadedImages && Array.isArray(item.uploadedImages)) {
      item.uploadedImages.forEach((imgData, photoIdx) => {
        if (imgData && imgData.base64) {
          const ext      = (imgData.name || 'photo').split('.').pop().toLowerCase() || 'jpg';
          const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
          const filename = `item${idx + 1}_photo${photoIdx + 1}_${imgData.name || 'image.' + ext}`;
          saveBase64ImageWithMime(imagesFolder, filename, imgData.base64, mimeType);
        }
      });
    }
  });

  return {
    orderFolder:   orderFolder.getUrl(),
    imagesFolder:  imagesFolder.getUrl(),
    previewFolder: previewFolder.getUrl()
  };
}

// ── Save base64 image (auto-detect PNG or JPEG) ──────────────
function saveBase64Image(folder, filename, base64DataUrl) {
  saveBase64ImageWithMime(folder, filename, base64DataUrl, 'image/png');
}

function saveBase64ImageWithMime(folder, filename, base64DataUrl, mimeType) {
  try {
    const base64 = base64DataUrl.includes(',')
      ? base64DataUrl.split(',')[1]
      : base64DataUrl;
    const decoded = Utilities.base64Decode(base64);
    const blob    = Utilities.newBlob(decoded, mimeType, filename);
    folder.createFile(blob);
  } catch (err) {
    Logger.log('saveBase64Image error [' + filename + ']: ' + err);
  }
}

// ════════════════════════════════════════════════════════════════
//  GOOGLE SHEETS — write one row per order
//  Columns must match your sheet exactly (see SHEET_HEADERS above)
// ════════════════════════════════════════════════════════════════
function logToSheet(payload, orderId, folderUrls) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  let   sheet = ss.getSheetByName(SHEET_NAME);

  // Auto-create sheet with headers if it doesn't exist yet
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(SHEET_HEADERS);
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length)
         .setFontWeight('bold')
         .setBackground('#121212')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }

  const c     = payload.customer || {};
  const items = payload.items    || [];

  // ── Size logic: expand each item's size ─────────────────────
  // e.g. 2×A4 + 3×A3  →  "A4, A4, A3, A3, A3"
  const sizeExpanded = items.map(i => i.size || '').join(', ');

  // ── Quantity: total number of frames ────────────────────────
  const quantity = items.length;

  // ── Layout: list all layouts ─────────────────────────────────
  const layouts = items.map(i => 'Layout ' + i.layout).join(', ');

  // ── Text option: combine all text lines ─────────────────────
  const textOptions = items.map(i => {
    const parts = [i.textLine1, i.textLine2a, i.textLine2b].filter(Boolean);
    return parts.length ? parts.join(' | ') : 'No text';
  }).join(' / ');

  // ── Full address ─────────────────────────────────────────────
  const fullAddress = [c.address, c.city, c.state, c.pincode]
    .filter(Boolean).join(', ');

  // ── Order date (IST) ─────────────────────────────────────────
  const orderDate = Utilities.formatDate(
    new Date(),
    'Asia/Kolkata',
    'dd-MM-yyyy HH:mm:ss'
  );

  const row = [
    orderId,                            // A: Order ID
    orderDate,                          // B: Order Date
    'Confirmed',                        // C: Order Status (default)
    c.name    || '',                    // D: Customer Name
    c.phone   || '',                    // E: Phone Number
    c.email   || '',                    // F: Email
    fullAddress,                        // G: Full Address
    c.state   || '',                    // H: State
    c.city    || '',                    // I: City
    c.pincode || '',                    // J: Pincode
    payload.totalAmount || 0,           // K: Order Value
    payload.paymentStatus || 'SUCCESS', // L: Payment Status
    layouts,                            // M: Layout
    sizeExpanded,                       // N: Size
    quantity,                           // O: Quantity
    textOptions                         // P: Text Option
  ];

  sheet.appendRow(row);

  try { sheet.autoResizeColumns(1, SHEET_HEADERS.length); } catch (_) {}
}

// ════════════════════════════════════════════════════════════════
//  EMAIL CONFIRMATION — sent to customer
// ════════════════════════════════════════════════════════════════
function sendConfirmationEmail(payload, orderId) {
  try {
    const c     = payload.customer;
    const items = payload.items || [];
    const total = payload.totalAmount || 0;

    // Build text description for each item
    const textOption = items.map(i => {
      const parts = [i.textLine1, i.textLine2a, i.textLine2b].filter(Boolean);
      return parts.length ? parts.join(' | ') : 'No text';
    }).join('; ');

    const sizeList  = items.map(i => i.size).join(', ');
    const layoutList= items.map(i => 'Layout ' + i.layout).join(', ');

    const itemsHtml = items.map((item, i) => {
      const txt = [item.textLine1, item.textLine2a, item.textLine2b].filter(Boolean).join(' | ') || 'No text';
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">
            Layout ${item.layout} &nbsp;·&nbsp; ${item.size}
            <br><span style="color:#777;font-size:11px">${txt}</span>
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;text-align:right;font-size:13px;font-weight:600">
            ₹${(item.price || 0).toLocaleString('en-IN')}
          </td>
        </tr>`;
    }).join('');

    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Inter,Helvetica,Arial,sans-serif;background:#f6f3ee;">
<div style="max-width:540px;margin:32px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

  <!-- Header -->
  <div style="background:#121212;padding:24px 32px;text-align:center;">
    <h1 style="color:#fff;font-size:20px;font-weight:300;letter-spacing:8px;margin:0;">WALLITUDE</h1>
  </div>

  <!-- Body -->
  <div style="padding:36px 32px;">
    <h2 style="font-size:22px;font-weight:700;margin:0 0 8px;">Order Confirmed! 🎉</h2>
    <p style="color:#777;font-size:14px;margin:0 0 24px;">Hi ${c.name}, your custom frame order has been received. We'll start crafting it right away.</p>

    <!-- Order ID box -->
    <div style="background:#f6f3ee;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <table style="width:100%;font-size:13px;">
        <tr>
          <td style="color:#777;padding:3px 0;width:120px;">Order ID</td>
          <td style="font-weight:700;color:#121212;">${orderId}</td>
        </tr>
        <tr>
          <td style="color:#777;padding:3px 0;">Payment ID</td>
          <td style="color:#121212;">${payload.paymentId || 'N/A'}</td>
        </tr>
        <tr>
          <td style="color:#777;padding:3px 0;">Status</td>
          <td style="color:#3a8f5e;font-weight:600;">Confirmed ✓</td>
        </tr>
      </table>
    </div>

    <!-- Items table -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#f6f3ee;">
          <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#777;">Item</th>
          <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#777;">Price</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr>
          <td style="padding:14px;font-size:14px;font-weight:700;">Total (incl. free shipping)</td>
          <td style="padding:14px;text-align:right;font-size:16px;font-weight:700;">₹${total.toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Delivery address -->
    <div style="border:1px solid #ddd8cf;border-radius:8px;padding:16px 20px;font-size:13px;margin-bottom:24px;">
      <p style="font-weight:700;margin:0 0 6px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#777;">Delivery Address</p>
      <p style="margin:0;color:#3a3a3a;line-height:1.6;">${c.address}, ${c.city}, ${c.state} — ${c.pincode}</p>
    </div>

    <!-- Delivery info -->
    <p style="font-size:13px;color:#777;line-height:1.6;margin:0 0 8px;">
      📦 <strong>Processing:</strong> 2–4 business days<br>
      🚚 <strong>Delivery:</strong> 5–10 business days across India<br>
      📲 Tracking details will be sent once your order ships.
    </p>

    <!-- Track order link -->
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="https://wallitude.com/tracking.html?orderId=${orderId}"
         style="display:inline-block;background:#121212;color:#fff;padding:13px 32px;border-radius:8px;font-size:12px;font-weight:700;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase;">
        Track Your Order
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f6f3ee;padding:20px 32px;text-align:center;border-top:1px solid #ddd8cf;">
    <p style="font-size:11px;color:#aaa;margin:0;">
      Questions? WhatsApp us at +91 6287656368 &nbsp;|&nbsp; info@wallitude.com<br>
      Instagram: @wallitude.co
    </p>
  </div>

</div>
</body>
</html>`;

    MailApp.sendEmail({
      to:       c.email,
      subject:  `✅ Order Confirmed — ${orderId} | Wallitude`,
      htmlBody: html,
      name:     'Wallitude'
    });

    Logger.log('Confirmation email sent to ' + c.email);

  } catch (err) {
    Logger.log('sendConfirmationEmail error: ' + err);
  }
}

// ════════════════════════════════════════════════════════════════
//  WHATSAPP BUSINESS NOTIFICATION — sent to Wallitude's own number
//  via CallMeBot (free). Customer placed an order alert.
//
//  NOTE: This notifies the BUSINESS OWNER, not the customer.
//  For automated customer WhatsApp messages you need Twilio or
//  Meta WhatsApp Business API (both require paid accounts).
// ════════════════════════════════════════════════════════════════
function sendBusinessWhatsApp(payload, orderId) {
  try {
    if (!CALLMEBOT_PHONE || CALLMEBOT_PHONE.startsWith('REPLACE')) return;

    const c     = payload.customer || {};
    const items = payload.items    || [];
    const total = payload.totalAmount || 0;

    const sizeList = items.map(i => i.size).join(', ');
    const qty      = items.length;

    const message =
      `🛍️ *New Wallitude Order!*\n\n` +
      `*Order ID:* ${orderId}\n` +
      `*Customer:* ${c.name || 'N/A'}\n` +
      `*Phone:* ${c.phone || 'N/A'}\n` +
      `*Sizes:* ${sizeList} (Qty: ${qty})\n` +
      `*Amount:* ₹${total.toLocaleString('en-IN')}\n` +
      `*Address:* ${c.address || ''}, ${c.city || ''} - ${c.pincode || ''}\n` +
      `*Payment:* ${payload.paymentId || 'N/A'}`;

    const encodedMsg = encodeURIComponent(message);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${CALLMEBOT_PHONE}&text=${encodedMsg}&apikey=${CALLMEBOT_APIKEY}`;

    UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log('WhatsApp notification sent');

  } catch (err) {
    Logger.log('sendBusinessWhatsApp error: ' + err);
    // Non-fatal
  }
}

// ── Generate fallback Order ID ────────────────────────────────
function generateOrderId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand  = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return 'WT-' + Date.now().toString(36).toUpperCase() + '-' + rand;
}
