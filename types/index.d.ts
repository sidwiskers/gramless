/**
 * TypeScript Type Definitions for Gramless
 * The Zero-Compromise Telegram Serverless Framework
 */

export interface InlineKeyboardButton {
  text: string;
  data?: string;
  callback_data?: string;
  url?: string;
  webApp?: string | { url: string };
  web_app?: string | { url: string };
  disabled?: boolean;
  copy_text?: { text: string };
  pay?: boolean;
  switch_inline_query?: string;
  switch_inline_query_current_chat?: string;
  switch_inline_query_chosen_chat?: any;
}

export type InlineKeyboardRow = Array<string | InlineKeyboardButton>;
export type InlineKeyboard = Array<InlineKeyboardRow>;

export interface ReplyKeyboardButton {
  text: string;
  requestContact?: boolean;
  request_contact?: boolean;
  requestLocation?: boolean;
  request_location?: boolean;
  requestUsers?: any;
  requestChat?: any;
}

export type ReplyKeyboardRow = Array<string | ReplyKeyboardButton>;
export type ReplyKeyboard = Array<ReplyKeyboardRow>;

export interface ReplyKeyboardOptions {
  resize?: boolean;
  oneTime?: boolean;
  persistent?: boolean;
  placeholder?: string;
  selective?: boolean;
}

export function buildInlineKeyboard(buttons: InlineKeyboard): { inline_keyboard: Array<Array<Record<string, any>>> } | undefined;
export function buildReplyKeyboard(buttons: ReplyKeyboard, options?: ReplyKeyboardOptions): Record<string, any> | undefined;
export function removeKeyboard(options?: { selective?: boolean }): { remove_keyboard: true; selective?: boolean };
export function forceReply(options?: { placeholder?: string; selective?: boolean }): { force_reply: true; input_field_placeholder?: string; selective?: boolean };

export class GramlessError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(message: string, code?: string, details?: Record<string, unknown>);
}

export class ApiError extends GramlessError {
  method: string;
  errorCode: number;
  description: string;
  parameters: Record<string, unknown>;
  readonly retryAfter: number | null;
  readonly migrateToChatId: number | null;
}

export class ValidationError extends GramlessError {
  issues: Array<{ field: string; message: string }>;
}

export class RoutingError extends GramlessError {}
export class SessionError extends GramlessError {}
export class PanicError extends GramlessError {
  cause: unknown;
}

export function sanitizeString(str: string): string;

export class GramlessContext {
  raw: Record<string, any>;
  ctx: Record<string, any>;
  update: Record<string, any>;
  api: any;
  match: RegExpMatchArray | string[] | null;
  params: Record<string, string>;
  state: Record<string, any>;
  session: any;
  command: string | null;
  payload: string;
  args: string[];
  fsm?: {
    readonly active: boolean;
    readonly current: string | null;
    readonly data: Record<string, any>;
    goto(stepName: string, payload?: Record<string, any>): void;
    back(): boolean;
    complete(): void;
  };

  readonly message: Record<string, any> | null;
  readonly chatId: number | string | null;
  readonly messageId: number | null;
  readonly from: Record<string, any> | null;
  readonly userId: number | null;
  readonly text: string;
  readonly data: string | null;
  readonly inlineQuery: Record<string, any> | null;
  readonly poll: Record<string, any> | null;
  readonly pollAnswer: Record<string, any> | null;
  readonly oldChatMember: Record<string, any> | null;
  readonly newChatMember: Record<string, any> | null;
  readonly isPrivate: boolean;
  readonly isGroup: boolean;
  readonly isChannel: boolean;

  call(method: string, params?: Record<string, any>): Promise<any>;

  reply(text: string, options?: Record<string, any>): Promise<any>;
  replyWithHtml(html: string, options?: Record<string, any>): Promise<any>;
  replyWithMarkdown(markdown: string, options?: Record<string, any>): Promise<any>;

  sendPhoto(photo: any, options?: Record<string, any>): Promise<any>;
  sendDocument(document: any, options?: Record<string, any>): Promise<any>;
  sendVideo(video: any, options?: Record<string, any>): Promise<any>;
  sendAnimation(animation: any, options?: Record<string, any>): Promise<any>;
  sendAudio(audio: any, options?: Record<string, any>): Promise<any>;
  sendVoice(voice: any, options?: Record<string, any>): Promise<any>;
  sendVideoNote(videoNote: any, options?: Record<string, any>): Promise<any>;
  sendMediaGroup(media: Array<Record<string, any>>, options?: Record<string, any>): Promise<any>;
  sendSticker(sticker: any, options?: Record<string, any>): Promise<any>;
  sendLocation(latitude: number, longitude: number, options?: Record<string, any>): Promise<any>;
  sendVenue(latitude: number, longitude: number, title: string, address: string, options?: Record<string, any>): Promise<any>;
  sendContact(phoneNumber: string, firstName: string, options?: Record<string, any>): Promise<any>;

  sendPoll(question: string, options: string[] | Array<{ text: string }>, pollOptions?: Record<string, any>): Promise<any>;
  stopPoll(messageId?: number | null, options?: Record<string, any>): Promise<any>;
  sendDice(emoji?: string, options?: Record<string, any>): Promise<any>;
  react(emoji: string | Array<Record<string, any>>, isBig?: boolean): Promise<any>;
  chatAction(action?: string): Promise<any>;

  edit(text: string, options?: Record<string, any>): Promise<any>;
  editCaption(caption: string, options?: Record<string, any>): Promise<any>;
  editMedia(media: Record<string, any>, options?: Record<string, any>): Promise<any>;
  editKeyboard(buttons: InlineKeyboard | Record<string, any>): Promise<any>;
  delete(messageId?: number | null): Promise<any>;
  deleteMessages(messageIds: number[]): Promise<any>;

  forward(toChatId: number | string, options?: Record<string, any>): Promise<any>;
  copy(toChatId: number | string, options?: Record<string, any>): Promise<any>;
  pin(options?: Record<string, any>): Promise<any>;
  unpin(messageId?: number | null, options?: Record<string, any>): Promise<any>;
  unpinAll(options?: Record<string, any>): Promise<any>;

  answer(text?: string, options?: Record<string, any>): Promise<any>;
  alert(text: string): Promise<any>;
  ephemeral(text: string, options?: Record<string, any>): Promise<any>;

  banSender(revokeMessages?: boolean): Promise<any>;
  banMember(userId: number, options?: Record<string, any>): Promise<any>;
  unbanMember(userId: number, options?: Record<string, any>): Promise<any>;
  restrictMember(userId: number, permissions: Record<string, boolean>, options?: Record<string, any>): Promise<any>;
  promoteMember(userId: number, options?: Record<string, any>): Promise<any>;
  setChatTitle(title: string): Promise<any>;
  setChatDescription(description: string): Promise<any>;
  createInviteLink(options?: Record<string, any>): Promise<any>;
  exportInviteLink(): Promise<any>;
  setMyCommands(commands: Array<{ command: string; description: string }>, options?: Record<string, any>): Promise<any>;
  getMyCommands(options?: Record<string, any>): Promise<any>;

  answerInlineQuery(results: Array<Record<string, any>>, options?: Record<string, any>): Promise<any>;
  answerShippingQuery(ok: boolean, options?: Record<string, any>): Promise<any>;
  answerPreCheckoutQuery(ok: boolean, errorMessage?: string): Promise<any>;
  sendInvoice(params: Record<string, any>): Promise<any>;
  createInvoiceLink(params: Record<string, any>): Promise<string>;

  createForumTopic(name: string, options?: Record<string, any>): Promise<any>;
  editForumTopic(messageThreadId: number, options?: Record<string, any>): Promise<any>;
  closeForumTopic(messageThreadId: number): Promise<any>;
  reopenForumTopic(messageThreadId: number): Promise<any>;
  deleteForumTopic(messageThreadId: number): Promise<any>;

  getFile(fileId: string): Promise<any>;
  getUserProfilePhotos(userId?: number | null, options?: Record<string, any>): Promise<any>;

  // Bot API 10.x
  sendRichMessage(richMessage: any, options?: Record<string, any>): Promise<any>;
  sendRichMessageDraft(richMessage: any, options?: Record<string, any>): Promise<any>;
  sendMessageDraft(draft: any, options?: Record<string, any>): Promise<any>;
  sendLivePhoto(photo: any, options?: Record<string, any>): Promise<any>;
  editEphemeralMessageText(text: string, options?: Record<string, any>): Promise<any>;
  deleteEphemeralMessage(ephemeralMessageId: number, options?: Record<string, any>): Promise<any>;
  answerGuestQuery(guestQueryId?: string | null, options?: Record<string, any>): Promise<any>;
}

export type HandlerFunction = (ctx: GramlessContext) => Promise<any> | any;
export type MiddlewareFunction = (ctx: GramlessContext, next: () => Promise<void>) => Promise<any> | any;
export type FilterPredicate = (ctx: GramlessContext) => Promise<boolean> | boolean;

export class GramlessRouter {
  constructor(options?: {
    filter?: FilterPredicate;
    api?: any;
    onError?: (err: Error, ctx: GramlessContext) => any;
    username?: string;
    botUsername?: string;
  });
  use(...middlewares: Array<MiddlewareFunction | MiddlewareFunction[]>): this;
  command(names: string | string[], ...handlers: HandlerFunction[]): this;
  action(trigger: string | RegExp, ...handlers: HandlerFunction[]): this;
  hears(pattern: string | RegExp, ...handlers: HandlerFunction[]): this;
  on(trigger: string | FilterPredicate, ...handlers: HandlerFunction[]): this;
  group(filter?: FilterPredicate): GramlessRouter;
  fallback(...handlers: HandlerFunction[]): this;
  handle(input: any, ctx?: any, api?: any): Promise<boolean>;
  handler(): (input: any, ctx: any) => Promise<any>;
}

export const Filter: {
  all(...predicates: FilterPredicate[]): FilterPredicate;
  any(...predicates: FilterPredicate[]): FilterPredicate;
  not(predicate: FilterPredicate): FilterPredicate;
  private: FilterPredicate;
  group: FilterPredicate;
  channel: FilterPredicate;
  hasText: FilterPredicate;
  hasPhoto: FilterPredicate;
  hasDocument: FilterPredicate;
  hasAudio: FilterPredicate;
  hasVoice: FilterPredicate;
  hasVideo: FilterPredicate;
  hasVideoNote: FilterPredicate;
  hasSticker: FilterPredicate;
  hasAnimation: FilterPredicate;
  hasLocation: FilterPredicate;
  hasContact: FilterPredicate;
  hasPoll: FilterPredicate;
  hasDice: FilterPredicate;
  isCallback: FilterPredicate;
  textPrefix(prefix: string): FilterPredicate;
  textMatches(pattern: RegExp): FilterPredicate;
  fromUsers(...userIds: number[]): FilterPredicate;
  inChats(...chatIds: Array<number | string>): FilterPredicate;
};

export interface SessionStore {
  get(key: string): Promise<any>;
  set(key: string, data: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemorySessionStore implements SessionStore {
  get(key: string): Promise<any>;
  set(key: string, data: any): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class TgCloudSessionStore implements SessionStore {
  constructor(options: { db: any; table: any; eq: any });
  get(key: string): Promise<any>;
  set(key: string, data: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export const SessionKey: {
  byUser(ctx: GramlessContext): string | null;
  byChat(ctx: GramlessContext): string | null;
  byChatUser(ctx: GramlessContext): string | null;
};

export function session(options?: {
  store?: SessionStore;
  getKey?: (ctx: GramlessContext) => string | null;
  initial?: () => any;
}): MiddlewareFunction;

export class FsmMachine {
  constructor(options?: { sessionProperty?: string; initialStep?: string });
  step(stepName: string, handler: (ctx: GramlessContext) => Promise<void> | void, guard?: FilterPredicate): this;
  onCancel(trigger: string | RegExp, onCancel?: (ctx: GramlessContext) => Promise<void> | void): this;
  middleware(): MiddlewareFunction;
}

export function createFSM(options?: { sessionProperty?: string; initialStep?: string }): FsmMachine;

export interface Validator<T> {
  type: string;
  validate(val: any, path?: string): Array<{ field: string; message: string }>;
}

export const v: {
  string(options?: { minLength?: number; maxLength?: number; pattern?: RegExp }): Validator<string>;
  number(options?: { min?: number; max?: number }): Validator<number>;
  boolean(): Validator<boolean>;
  optional<T>(validator: Validator<T>): Validator<T | undefined>;
  array<T>(validator: Validator<T>, options?: { minItems?: number }): Validator<T[]>;
  object<T extends Record<string, Validator<any>>>(shape: T): Validator<any>;
};

export function createEndpoint(
  config: { requireAuth?: boolean; schema?: Validator<any> } | Function,
  handler?: (ctx: { input: any; user: any; initData: any; rawCtx: any }) => Promise<any> | any
): (input: any, ctx: any) => Promise<any>;

export function createBot(options?: {
  api?: any;
  onError?: (err: Error, ctx: GramlessContext) => any;
}): GramlessRouter;

export default createBot;
