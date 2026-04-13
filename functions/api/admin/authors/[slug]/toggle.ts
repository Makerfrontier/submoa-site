import { handleToggleAuthor } from '../../../../../src/routes/admin';
export const onRequestPost = (ctx) => handleToggleAuthor(ctx.request, ctx.env, ctx.params.slug);
