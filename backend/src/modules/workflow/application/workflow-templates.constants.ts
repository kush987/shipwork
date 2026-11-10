export const X = 300;

export const Y = 150;

export const NOTIFY_SHIPPED = {
  channel: 'whatsapp',
  to: '{{shipment.customer.phone}}',
  message: 'Hi {{shipment.customer.name}}, order {{shipment.orderId}} ships with {{shipment.courier}} · AWB {{shipment.awb}}',
};

/** Template bound to new endpoints that don't name a workflow: request in, response out. */
export const API_ENDPOINT_TEMPLATE_ID = 'api-endpoint';

export const ORDER_PRICING_CODE = `// Price the order from the product loaded earlier; the result is saved as context.pricing.
function run({ request, context }) {
  const quantity = Number(request.body.quantity);
  const subtotal = context.product.price * quantity;
  const discountPct = subtotal > 5000 ? 10 : 0;
  return {
    quantity,
    subtotal,
    discountPct,
    total: Math.round(subtotal * (100 - discountPct)) / 100,
    remainingStock: context.product.stock - quantity,
  };
}
`;

/** Marks a template step's workflow as one of the template's own parts until it is created. */
export const PART_REF_PREFIX = '@part:';

/** Takes the ordered quantity out of stock; the result is saved as context.next. */
export const RESERVE_STOCK_CODE = `// Takes the ordered quantity out of stock; the result is saved as context.next.
function run({ request, context }) {
  return { stock: context.product.stock - Number(request.body.quantity) };
}
`;
