import { handleGetQueue, handleRequeue, handleCancelQueue } from '../../../../src/routes/admin';
export const onRequestGet = (ctx) => handleGetQueue(ctx.request, ctx.env);
