import { GramlessRouter, MemorySessionStore } from './index.js';

export interface VirtualActorOptions {
  id?: number;
  username?: string;
  first_name?: string;
  chatId?: number;
}

export class ActorExpectation {
  calls: Array<{ method: string; params: Record<string, any> }>;
  constructor(calls: Array<{ method: string; params: Record<string, any> }>);
  wantSent(pattern: string | RegExp, options?: { buttons?: boolean }): this;
  wantEdited(pattern: string | RegExp): this;
  wantAnswered(pattern?: string | null): this;
  wantWidgetSent(htmlPattern?: string | RegExp | null): this;
  wantWidgetQueryAnswered(dataPattern?: string | null): this;
  wantInlineAnswered(expectedCount?: number | null): this;
  want(matcherFn: (calls: any[]) => void): this;
}

export class LabActor {
  id: number;
  username: string;
  firstName: string;
  chatId: number;
  chatType: string;
  updateCounter: number;
  lab: GramlessLab;
  constructor(lab: GramlessLab, profile?: VirtualActorOptions);
  command(text: string): Promise<ActorExpectation>;
  message(text: string, options?: Record<string, any>): Promise<ActorExpectation>;
  click(data: string, options?: { messageId?: number; inlineMessageId?: string }): Promise<ActorExpectation>;
  inline(query: string, offset?: string): Promise<ActorExpectation>;
  queryWidget(data: string, options?: { messageId?: number; widgetId?: string; type?: any }): Promise<ActorExpectation>;
  querySharedWidget(widgetId: string, data: string, options?: { type?: any }): Promise<ActorExpectation>;
  sendsCommand(command: string, payload?: string): Promise<any>;
  sendsMessage(text: string, options?: Record<string, any>): Promise<any>;
  clicks(callbackData: string, messageId?: number): Promise<any>;
  inlineQuery(query: string, options?: Record<string, any>): Promise<any>;
}

export class MockBotApi {
  calls: Array<{ method: string; params: Record<string, any> }>;
  outbound: Array<{ method: string; params: Record<string, any> }>;
  reset(): void;
  [method: string]: any;
}

export class GramlessLab {
  router: GramlessRouter;
  api: MockBotApi;
  store: MemorySessionStore;
  constructor(router: GramlessRouter);
  actor(profile?: VirtualActorOptions): LabActor;
  user(id: number, name?: string): LabActor;
  groupMember(userId: number, groupId: number, name?: string): LabActor;
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

