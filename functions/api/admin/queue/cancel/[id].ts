import { handleCancelQueue } from '../../../../../src/routes/admin';
export const onRequestPost = (ctx) => handleCancelQueue(ctx.request, ctx.env, ctx.params.id);
