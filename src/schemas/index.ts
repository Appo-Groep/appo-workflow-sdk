import { authSchema } from './auth.schema';
import { authErrorSchema } from './auth_error.schema';
import { authSuccessSchema } from './auth_success.schema';
import { actionSchema } from './action.schema';
import { broadcastGlobalSchema } from './broadcast_global.schema';
import { broadcastUserSchema } from './broadcast_user.schema';
import { contextDataSchema } from './context_data.schema';
import { contextGetSchema } from './context_get.schema';
import { contextUpdateSchema } from './context_update.schema';
import { errorSchema } from './error.schema';
import { forwardSchema } from './forward.schema';
import { injectHtmlSchema } from './inject_html.schema';
import { pingSchema } from './ping.schema';
import { pongSchema } from './pong.schema';
import { presenceUpdateSchema } from './presence_update.schema';
import { stateDataSchema } from './state_data.schema';
import { stateGetSchema } from './state_get.schema';
import { stateSetSchema } from './state_set.schema';
import { tokenExpiredSchema } from './token_expired.schema';

export const messageSchemas: Record<string, object> = {
  // client → server
  auth: authSchema,
  context_update: contextUpdateSchema,
  context_get: contextGetSchema,
  state_set: stateSetSchema,
  state_get: stateGetSchema,
  forward: forwardSchema,
  action: actionSchema,
  inject_html: injectHtmlSchema,
  broadcast_user: broadcastUserSchema,
  broadcast_global: broadcastGlobalSchema,
  ping: pingSchema,

  // server → client
  auth_success: authSuccessSchema,
  auth_error: authErrorSchema,
  context_data: contextDataSchema,
  state_data: stateDataSchema,
  presence_update: presenceUpdateSchema,
  error: errorSchema,
  pong: pongSchema,
  token_expired: tokenExpiredSchema,
};

export {
  authSchema,
  authErrorSchema,
  authSuccessSchema,
  actionSchema,
  broadcastGlobalSchema,
  broadcastUserSchema,
  contextDataSchema,
  contextGetSchema,
  contextUpdateSchema,
  errorSchema,
  forwardSchema,
  injectHtmlSchema,
  pingSchema,
  pongSchema,
  presenceUpdateSchema,
  stateDataSchema,
  stateGetSchema,
  stateSetSchema,
  tokenExpiredSchema,
};
