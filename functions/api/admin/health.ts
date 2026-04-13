import { handleGetHealth } from '../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetHealth(ctx.request, ctx.env);
