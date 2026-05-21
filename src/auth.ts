import type { WssClientType } from './types';

export interface AuthMessage {
  type: 'auth';
  token: string;
  shared_id: string;
  client_type: WssClientType;
  client_version?: string;
}

export function buildAuthMessage(args: {
  token: string;
  sharedId: string;
  clientType: WssClientType;
  clientVersion?: string;
}): AuthMessage {
  const msg: AuthMessage = {
    type: 'auth',
    token: args.token,
    shared_id: args.sharedId,
    client_type: args.clientType,
  };
  if (args.clientVersion !== undefined) {
    msg.client_version = args.clientVersion;
  }
  return msg;
}
