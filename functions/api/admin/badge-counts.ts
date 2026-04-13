import { handleGetBadgeCounts } from '../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetBadgeCounts(ctx.request, ctx.env);
