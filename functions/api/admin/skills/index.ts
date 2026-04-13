import { handleGetSkills } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetSkills(ctx.request, ctx.env);
