# Recipe 05: Telegram Stars Paywall & Digital Goods

This recipe shows how to monetize your Telegram bot using native **Telegram Stars** (`currency: 'XTR'`), handle the two-phase checkout lifecycle, and persist purchase confirmations to SQLite.

---

## Architectural Problem: The Two-Phase Checkout Lifecycle

Telegram's native digital goods payment system requires a strict two-phase handshake:
1. **Invoice Issuance:** The bot sends an invoice message with `currency: 'XTR'` (the official ISO symbol for Telegram Stars).
2. **Pre-Checkout Handshake (`pre_checkout_query`):** When the user clicks "Pay", Telegram's payment servers ping your webhook with a `pre_checkout_query`. Your bot **must respond within 10 seconds** via `answerPreCheckoutQuery(true)` to approve the charge, or `answerPreCheckoutQuery(false, { error_message })` to reject it (e.g. if the item is out of stock).
3. **Fulfillment (`successful_payment`):** Once payment settles, Telegram sends a `message` containing `successful_payment`. You must save `telegram_payment_charge_id` to prevent duplicate fulfillments.

---

## Directory Structure

```text
05-telegram-stars/
├── tgcloud/
│   ├── schema.js                  # Purchases table
│   ├── handlers/
│   │   ├── message.js             # Invoices & successful_payment fulfillment
│   │   └── pre_checkout_query.js  # Approves/rejects transaction handshake
│   └── lib/
│       └── bot.js                 # Shared payment routing logic
├── package.json
└── tgcloud.jsonc
```

---

## Code Walkthrough

### 1. Issuing a Telegram Stars Invoice

```javascript
bot.command('buy', async (ctx) => {
  await ctx.sendInvoice({
    title: 'VIP Community Membership',
    description: 'Instant 30-day access to premium analytics.',
    payload: `vip_membership_${ctx.userId}_${Date.now()}`,
    currency: 'XTR', // Telegram Stars currency code
    prices: [
      { label: 'VIP Pass', amount: 50 }, // 50 Stars
    ],
  });
});
```

### 2. Pre-Checkout Verification

```javascript
bot.on('pre_checkout_query', async (ctx) => {
  const query = ctx.raw.pre_checkout_query || ctx.raw;
  
  // Verify order payload or inventory
  if (!query.invoice_payload?.startsWith('vip_membership_')) {
    return ctx.answerPreCheckoutQuery(false, {
      error_message: 'This product is no longer active.',
    });
  }

  // Authorize Telegram to charge user
  await ctx.answerPreCheckoutQuery(true);
});
```

### 3. Fulfilling the Order

```javascript
bot.on('successful_payment', async (ctx) => {
  const payment = ctx.raw.successful_payment || ctx.raw.message?.successful_payment;

  await db.insert(purchases).values({
    userId: ctx.userId,
    item: 'vip_membership',
    starsPaid: payment.total_amount,
    telegramPaymentChargeId: payment.telegram_payment_charge_id,
  }).run();

  await ctx.reply(`Payment confirmed. VIP pass is activated.`);
});
```

---

## Rules That Bite

- **Provider Token is Empty for Stars:** For traditional credit cards or Stripe payments, Telegram requires a payment provider token. For **Telegram Stars**, leave `provider_token` empty or omitted—Telegram processes Stars natively.
- **Dedicated Handler for `pre_checkout_query`:** In TGCloud, `pre_checkout_query` updates are routed directly to `tgcloud/handlers/pre_checkout_query.js`. Failing to export a handler for this file will cause checkout attempts to time out.
