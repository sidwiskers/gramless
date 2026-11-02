import { GramlessRouter } from './index.js';

export interface VirtualActorOptions {
  id?: number;
  username?: string;
  first_name?: string;
  chatId?: number;
}

export class LabActor {
  id: number;
  username: string;
  first_name: string;
  chatId: number;
  constructor(lab: GramlessLab, options?: VirtualActorOptions);
  sendsCommand(command: string, payload?: string): Promise<any>;
  sendsMessage(text: string, options?: Record<string, any>): Promise<any>;
  clicks(callbackData: string, messageId?: number): Promise<any>;
  inlineQuery(query: string, options?: Record<string, any>): Promise<any>;
}

export class MockBotApi {
  outbound: Array<{ method: string; params: Record<string, any> }>;
  reset(): void;
  [method: string]: any;
}

export class GramlessLab {
  router: GramlessRouter;
  api: MockBotApi;
  constructor(router: GramlessRouter);
  createUser(options?: VirtualActorOptions): LabActor;
  createActor(options?: VirtualActorOptions): LabActor;
  dispatch(update: Record<string, any>): Promise<any>;
  reset(): void;
  getOutbound(): Array<{ method: string; params: Record<string, any> }>;
  findSent(predicate?: (call: { method: string; params: any }) => boolean): any;
}

export function createLab(router: GramlessRouter): GramlessLab;

export function Sent(method: string, matchers?: Record<string, any>): (calls: any[]) => boolean;
export function Edited(matchers?: Record<string, any>): (calls: any[]) => boolean;
export function Answered(matchers?: Record<string, any>): (calls: any[]) => boolean;

export default GramlessLab;
