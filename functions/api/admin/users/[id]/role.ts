import { handleUpdateUserRole } from '../../../../../../src/routes/admin';
export const onRequestPut = (ctx) => handleUpdateUserRole(ctx.request, ctx.env, ctx.params.id);
