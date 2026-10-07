import { handlers, route } from '../_shared.mjs';
export default route('POST', handlers.stripeWebhook, { raw: true });
