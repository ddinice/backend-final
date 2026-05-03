export type OrdersProcessMessage = {
  messageId: string;
  orderId: string;
  /** Original X-Idempotency-Key from create order (for tracing / optional reuse). */
  idempotencyKey?: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  attempt: number;
  correlationId?: string;
  producer?: string;
  eventName?: string;
};
