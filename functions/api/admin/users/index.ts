import { handleGetUsers } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetUsers(ctx.request, ctx.env);
