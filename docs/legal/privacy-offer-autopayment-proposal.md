# Privacy / Offer — proposed autopayment wording (NOT APPLIED)

Draft for legal review. Do not merge until counsel approves.

## Privacy (`privacy-ru.json` §7, §6, §13, §14)

Replace absolute «данные банковской карты … не сохраняются» with:

- PAN/CVV are not stored; entered only at YooKassa.
- For Premium auto-renewal: store `payment_method_id` + masked card label linked to account.
- User may disable auto-renew or unlink card in Dashboard → Collection → Payment method; Site deletes identifier and mask and stops automatic charges.

Mirror the same in `privacy-en.json`.

## Offer (`offer-ru.json` / `offer-en.json`)

Add new section **«Premium subscription and autopayments»** covering:

1. Premium is access for a paid period; prices on Site.
2. Saving PM requires consent on YooKassa page (including «Remember card details»).
3. Merchant stores PM identifier + mask only; no full card data.
4. Auto-renewal: charge at plan price every 30 days (or as shown on plan page).
5. User may disable auto-renew or unlink card in dashboard anytime; access until period end.
6. No automatic charges without saved PM or when auto-renew is off.

See full draft paragraphs in audit conversation (2026-08-10).
