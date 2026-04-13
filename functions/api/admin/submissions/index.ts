import { handleGetSubmissions } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetSubmissions(ctx.request, ctx.env);
