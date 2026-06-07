-- Миграция: Создание таблиц для заказов и платежей
-- Дата: 2024

-- Таблица заказов
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  album_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'paid', 'canceled', 'failed')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  customer_email VARCHAR(255) NOT NULL,
  buyer_display_name VARCHAR(255),
  customer_phone VARCHAR(50),
  payment_provider VARCHAR(20) DEFAULT 'yookassa' CHECK (payment_provider IN ('yookassa', 'stripe', 'paypal')),
  payment_id VARCHAR(255), -- ID платежа от провайдера (yookassa payment id)
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_album_id ON orders(album_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Таблица платежей (для детальной истории)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('yookassa', 'stripe', 'paypal')),
  provider_payment_id VARCHAR(255) NOT NULL, -- ID платежа от провайдера
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'canceled', 'failed', 'waiting_for_capture')),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'RUB',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  raw_last_event JSONB, -- Последнее событие от провайдера для отладки
  
  -- Уникальность: один платеж провайдера = одна запись
  UNIQUE(provider, provider_payment_id)
);

-- Индексы для платежей
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Таблица для идемпотентности webhook'ов (чтобы не обрабатывать одно событие дважды)
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(20) NOT NULL,
  event_id VARCHAR(255) NOT NULL, -- ID события от провайдера
  event_type VARCHAR(100) NOT NULL,
  payment_id VARCHAR(255) NOT NULL,
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Уникальность: одно событие = одна запись
  UNIQUE(provider, event_id)
);

-- Индексы для webhook событий
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_event_id ON webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_payment_id ON webhook_events(payment_id);

-- Триггеры для автоматического обновления updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Комментарии
COMMENT ON TABLE orders IS 'Заказы пользователей';
COMMENT ON COLUMN orders.id IS 'Уникальный идентификатор заказа';
COMMENT ON COLUMN orders.status IS 'Статус заказа: draft, pending_payment, paid, canceled, failed';
COMMENT ON COLUMN orders.payment_id IS 'ID платежа от провайдера (yookassa payment id)';
COMMENT ON COLUMN orders.paid_at IS 'Дата и время оплаты';

COMMENT ON TABLE payments IS 'Детальная история платежей';
COMMENT ON COLUMN payments.provider_payment_id IS 'ID платежа от провайдера';
COMMENT ON COLUMN payments.status IS 'Статус платежа: pending, succeeded, canceled, failed, waiting_for_capture';
COMMENT ON COLUMN payments.raw_last_event IS 'Последнее событие от провайдера в формате JSON';

COMMENT ON TABLE webhook_events IS 'Обработанные webhook события для идемпотентности';
COMMENT ON COLUMN webhook_events.event_id IS 'Уникальный ID события от провайдера';

