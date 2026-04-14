import { handleGradeAll } from '../../routes/grade';
export const onRequestPost = (ctx) => handleGradeAll(ctx.request, ctx.env);
