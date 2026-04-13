/**
 * Wallitude Checkout Module
 * Handles Razorpay payment + order submission to Google Apps Script
 *
 * SETUP:
 *  1. Replace RAZORPAY_KEY_ID with your live/test key from Razorpay dashboard
 *  2. Replace GAS_URL with your deployed Google Apps Script Web App URL
 */

const Checkout = (() => {
  // ── Configuration ──────────────────────────────────────────
  const RAZORPAY_KEY_ID = 'rzp_live_Sczvk68iCuryMo';   // ← replace
  const GAS_URL         = 'https://script.google.com/macros/s/AKfycbzHCMUVrJLTQqvPZSHxDH6NGojIlW-zB4wU_oRfCGq93AwKqfoeq3xXzgktdtoD5dVp/exec'; // ← replace

  // ── Generate Order ID ───────────────────────────────────────
  function generateOrderId() {
    const ts     = Date.now().toString(36).toUpperCase();
    const rand   = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `WT-${ts}-${rand}`;
  }

  // ── Validate form fields ────────────────────────────────────
  function validateForm(data) {
    const required = ['name', 'phone', 'email', 'address', 'city', 'state', 'pincode'];
    for (const field of required) {
      if (!data[field] || !data[field].trim()) {
        return `Please fill in your ${field}.`;
      }
    }
    if (!/^\d{10}$/.test(data.phone.replace(/\s/g, ''))) {
      return 'Please enter a valid 10-digit phone number.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return 'Please enter a valid email address.';
    }
    if (!/^\d{6}$/.test(data.pincode.replace(/\s/g, ''))) {
      return 'Please enter a valid 6-digit pincode.';
    }
    return null;
  }

  // ── Submit order to Google Apps Script ─────────────────────
  async function submitOrderToGAS(orderPayload) {
    try {
      const response = await fetch(GAS_URL, {
        method: 'POST',
        mode:   'no-cors',                    // GAS returns opaque response
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      console.log('Order submitted to GAS (no-cors)');
    } catch (err) {
      console.error('GAS submission error:', err);
      // Non-fatal — order was paid, we'll still confirm to user
    }
  }

  // ── Open Razorpay modal ─────────────────────────────────────
  function openRazorpay({ customerData, cartItems, totalAmount, orderId, onSuccess, onFailure }) {
    const options = {
      key:         RAZORPAY_KEY_ID,
      amount:      totalAmount * 100,            // in paise
      currency:    'INR',
      name:        'Wallitude',
      description: `Order ${orderId} — Custom Frames`,
      order_id:    '',                           // set if using Razorpay Orders API
      prefill: {
        name:    customerData.name,
        email:   customerData.email,
        contact: customerData.phone
      },
      notes: {
        order_id: orderId,
        address:  `${customerData.address}, ${customerData.city}, ${customerData.state} - ${customerData.pincode}`
      },
      theme: { color: '#121212' },
      modal: {
        ondismiss: () => {
          if (typeof onFailure === 'function') onFailure('Payment cancelled');
        }
      },
      handler: async (response) => {
        // Build order payload for GAS
        const orderPayload = {
          orderId,
          paymentId:      response.razorpay_payment_id,
          paymentStatus:  'SUCCESS',
          customer:       customerData,
          items:          cartItems.map(item => ({
            layout:    item.layout,
            size:      item.size,
            price:     item.price,
            textLine1: item.textLine1 || '',
            textLine2a:item.textLine2a || '',
            textLine2b:item.textLine2b || '',
            imageCount: (item.imageFiles || []).length,
            preview:   item.previewDataUrl || null   // base64 preview PNG
          })),
          totalAmount,
          timestamp: new Date().toISOString()
        };

        await submitOrderToGAS(orderPayload);

        if (typeof onSuccess === 'function') onSuccess(orderId, response.razorpay_payment_id);
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (resp) => {
      if (typeof onFailure === 'function') onFailure(resp.error.description);
    });
    rzp.open();
  }

  // ── Entry point called from checkout page ───────────────────
  function startCheckout({ customerData, cartItems, onSuccess, onFailure }) {
    const error = validateForm(customerData);
    if (error) {
      if (typeof onFailure === 'function') onFailure(error);
      return;
    }

    const totalAmount = cartItems.reduce((s, i) => s + (i.price || 0), 0);
    const orderId     = generateOrderId();

    openRazorpay({ customerData, cartItems, totalAmount, orderId, onSuccess, onFailure });
  }

  return { startCheckout, generateOrderId, validateForm };
})();
