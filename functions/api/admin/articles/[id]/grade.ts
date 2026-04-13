import { handleGradeArticle, handleGetGrade } from '../../../../../src/routes/grade';
export const onRequestPost = (ctx) => handleGradeArticle(ctx.request, ctx.env, ctx.params.id);
export const onRequestGet = (ctx) => handleGetGrade(ctx.request, ctx.env, ctx.params.id);
