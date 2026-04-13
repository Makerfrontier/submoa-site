import { handleUpdateAuthor, handleToggleAuthor } from '../../../../src/routes/admin';
export const onRequestPut = (ctx) => handleUpdateAuthor(ctx.request, ctx.env, ctx.params.slug);
