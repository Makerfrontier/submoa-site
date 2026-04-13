import { handleGetAuthors } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetAuthors(ctx.request, ctx.env);
