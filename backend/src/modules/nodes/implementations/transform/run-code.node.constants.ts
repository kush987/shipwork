export const RUN_CODE_STARTER = `// Return any value — it is saved as context.<Save result as> for the next steps.
//   request  → the API call: { method, path, params, query, headers, body } (null for other triggers)
//   context  → values saved by earlier steps        trigger → { event, data }
//   shipment → the shipment, in logistics workflows
// Throw an Error to fail the step (it follows the "Failed" output when connected).
// Runs in a sandbox: no network, files or timers; 1 s and 16 MB at most. console.log() shows in the run.
function run({ request, context }) {
  const items = request?.body?.items ?? [];
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { total, discount: total > 5000 ? 10 : 0 };
}
`;
