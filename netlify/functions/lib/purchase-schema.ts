/** SQL fragment: active (non-revoked) purchases only. */
export function activePurchaseFilter(alias = ''): string {
  const prefix = alias ? `${alias}.` : '';
  return `AND ${prefix}revoked_at IS NULL`;
}
