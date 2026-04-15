export type OrdersProcessMessage = {
  messageId: string;
  orderId: string;
  attempt: number;
  createdAt: string;
  correlationId?: string;
  producer?: string;
  eventName?: string;
};
