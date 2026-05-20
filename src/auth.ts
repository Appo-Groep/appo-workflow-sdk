import type { WssClientType } from './types';

export interface AuthMessage {
  type: 'auth';
  token: string;
  shared_id: string;
  client_type: WssClientType;
}

export function buildAuthMessage(args: {
  token: string;
  sharedId: string;
  clientType: WssClientType;
}): AuthMessage {
  return {
    type: 'auth',
    token: args.token,
    shared_id: args.sharedId,
    client_type: args.clientType,
  };
}
