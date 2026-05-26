import type { WssClientType } from './types';

export interface TokenAuthMessage {
  type: 'auth';
  token: string;
  shared_id: string;
  client_type: WssClientType;
  client_version?: string;
}

export interface TicketAuthMessage {
  type: 'auth';
  ticket: string;
  shared_id: string;
  client_type: WssClientType;
  retool_user_id?: string;
  client_version?: string;
}

export type AuthMessage = TokenAuthMessage | TicketAuthMessage;

export function buildAuthMessage(args: {
  token: string;
  sharedId: string;
  clientType: WssClientType;
  clientVersion?: string;
}): TokenAuthMessage {
  const msg: TokenAuthMessage = {
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

export function buildTicketAuthMessage(args: {
  ticket: string;
  sharedId: string;
  clientType: WssClientType;
  retoolUserId?: string;
  clientVersion?: string;
}): TicketAuthMessage {
  const msg: TicketAuthMessage = {
    type: 'auth',
    ticket: args.ticket,
    shared_id: args.sharedId,
    client_type: args.clientType,
  };
  if (args.retoolUserId !== undefined) {
    msg.retool_user_id = args.retoolUserId;
  }
  if (args.clientVersion !== undefined) {
    msg.client_version = args.clientVersion;
  }
  return msg;
}
