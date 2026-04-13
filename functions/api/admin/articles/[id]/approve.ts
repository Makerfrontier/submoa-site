import { handleApproveArticle } from '../../../../../src/routes/admin';
export const onRequestPost = (ctx) => handleApproveArticle(ctx.request, ctx.env, ctx.params.id);
