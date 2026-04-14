/**
 * Wallitude Checkout Module  (v2 — Fixed)
 *
 * KEY FIXES vs v1:
 *  1. submitOrderToGAS now uses FormData instead of JSON body.
 *     Root cause of Sheets not receiving data: `mode: no-cors` +
 *     `Content-Type: application/json` is blocked by the browser as a
 *     "non-simple" cross-origin request. FormData IS allowed with no-cors.
 *
 *  2. Each cart item now carries `uploadedImages` (compressed base64)
 *     so Google Drive Images/ folder gets the actual photos.
 *
 * SETUP:
 *  1. Replace RAZORPAY_KEY_ID with your key from razorpay.com/dashboard
 *  2. Replace GAS_URL with your deployed Apps Script Web App URL
 */

const Checkout = (() => {

  // ── YOUR CONFIG ──────────────────────────────────────────────
  const RAZORPAY_KEY_ID = 'rzp_test_SdLEnL0lYIFFpw';  // ← TEST KEY. Switch to rzp_live_Sczvk68iCuryMo when going live
  const GAS_URL         = 'https://script.google.com/macros/s/AKfycbxsKd0vX6r9kNrWzMM0b8hVaHoJmun62E98Uae2aOrnaqqo96Uu-Ddw6x0hosg-ILEk/exec';

  function generateOrderId() {
    const ts   = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'WT-' + ts + '-' + rand;
  }

  function validateForm(data) {
    const required = ['name', 'phone', 'email', 'address', 'city', 'state', 'pincode'];
    for (const field of required) {
      if (!data[field] || !data[field].trim()) return 'Please fill in your ' + field + '.';
    }
    if (!/^\d{10}$/.test(data.phone.replace(/\s/g, '')))
      return 'Please enter a valid 10-digit phone number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
      return 'Please enter a valid email address.';
    if (!/^\d{6}$/.test(data.pincode.replace(/\s/g, '')))
      return 'Please enter a valid 6-digit pincode.';
    return null;
  }

  // FIX: FormData instead of JSON body — this is why Sheets was getting no data
  async function submitOrderToGAS(orderPayload) {
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify(orderPayload));
      await fetch(GAS_URL, {
        method: 'POST',
        mode:   'no-cors',
        body:   formData
      });
      console.log('Order submitted to GAS');
    } catch (err) {
      console.error('GAS submission error:', err);
    }
  }

  function openRazorpay({ customerData, cartItems, totalAmount, orderId, onSuccess, onFailure }) {
    const options = {
      key:         RAZORPAY_KEY_ID,
      amount:      totalAmount * 100,
      currency:    'INR',
      name:        'Wallitude',
      description: 'Order ' + orderId + ' — Custom Frames',
      prefill: {
        name:    customerData.name,
        email:   customerData.email,
        contact: customerData.phone
      },
      notes: {
        order_id: orderId,
        address:  customerData.address + ', ' + customerData.city + ', ' + customerData.state + ' - ' + customerData.pincode
      },
      theme: { color: '#121212' },
      modal: {
        ondismiss: function() {
          if (typeof onFailure === 'function') onFailure('Payment cancelled');
        }
      },
      handler: async function(response) {
        const orderPayload = {
          orderId:       orderId,
          paymentId:     response.razorpay_payment_id,
          paymentStatus: 'SUCCESS',
          customer:      customerData,
          totalAmount:   totalAmount,
          timestamp:     new Date().toISOString(),
          items: cartItems.map(function(item) {
            return {
              layout:         item.layout,
              size:           item.size,
              price:          item.price,
              textLine1:      item.textLine1  || '',
              textLine2a:     item.textLine2a || '',
              textLine2b:     item.textLine2b || '',
              imageCount:     (item.uploadedImages || item.imageFiles || []).length,
              preview:        item.previewDataUrl   || null,
              uploadedImages: item.uploadedImages   || []
            };
          })
        };
        await submitOrderToGAS(orderPayload);
        if (typeof onSuccess === 'function') onSuccess(orderId, response.razorpay_payment_id);
      }
    };
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function(resp) {
      if (typeof onFailure === 'function') onFailure(resp.error.description);
    });
    rzp.open();
  }

  function startCheckout({ customerData, cartItems, onSuccess, onFailure }) {
    const error = validateForm(customerData);
    if (error) { if (typeof onFailure === 'function') onFailure(error); return; }
    const totalAmount = cartItems.reduce(function(s, i) { return s + (i.price || 0); }, 0);
    const orderId     = generateOrderId();
    openRazorpay({ customerData, cartItems, totalAmount, orderId, onSuccess, onFailure });
  }

  return { startCheckout, generateOrderId, validateForm };

})();
