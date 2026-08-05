/**
 * PR-10 tier1/tier3 Jest env — SUBSCRIPTION_AUTO_RENEW_ENABLED=true
 */
process.env.SUBSCRIPTION_AUTO_RENEW_ENABLED = 'true';
process.env.DEV_PAYMENT_MODE = 'true';
process.env.NODE_ENV = 'test';
process.env.YOOKASSA_TEST_MODE = 'true';
