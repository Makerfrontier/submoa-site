import { handleGetUsage } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetUsage(ctx.request, ctx.env);
