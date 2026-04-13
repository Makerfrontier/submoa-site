import { handleGetStats } from '../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetStats(ctx.request, ctx.env);
