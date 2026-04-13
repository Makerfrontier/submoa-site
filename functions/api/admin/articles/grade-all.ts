import { handleGradeAll } from '../../../../src/routes/grade';
export const onRequestPost = (ctx) => handleGradeAll(ctx.request, ctx.env);
