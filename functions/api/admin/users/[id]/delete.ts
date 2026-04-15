import { handleDeleteUser } from '../../../../../src/routes/admin';
export const onRequestDelete = (ctx) => handleDeleteUser(ctx.request, ctx.env, ctx.params.id);
