/**
 * Public copyright claim form + API: minimum description length (characters after trim).
 * Keep in sync with server validation in netlify/functions (MIN_DESCRIPTION_CHARS).
 */
export const MIN_COPYRIGHT_CLAIM_DESCRIPTION_CHARS = 20;

/** UI maxlength; server still allows up to {@link MAX_DESCRIPTION_CHARS} in netlify/functions. */
export const MAX_COPYRIGHT_CLAIM_DESCRIPTION_CHARS_UI = 2000;
