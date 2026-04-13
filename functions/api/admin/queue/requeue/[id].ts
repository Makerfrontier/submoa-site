import { handleRequeue } from '../../../../../src/routes/admin';
export const onRequestPost = (ctx) => handleRequeue(ctx.request, ctx.env, ctx.params.id);
