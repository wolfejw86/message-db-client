export interface IStreamMessage<TType = string, TData = any, TMeta = any> {
  id: string;
  type: TType;
  metadata?: TMeta;
  data: TData;
}

export interface IDb {
  /**
   * run a sql query - loosely typed for now
   * must return an array of row data
   * TODO - better typing possibly with generics
   */
  query: (sql: any, values?: any[]) => Promise<any[]>;
  /**
   * close the database client
   */
  close: () => Promise<void>;
}

export type MessageHandler = { [key: string]: (event: any) => Promise<void> };

export interface IEventStreamSubscriptionConfig<T extends MessageHandler> {
  streamName: string;
  handlers: T;
  subscriberId: string;
  messagesPerTick?: number;
  positionUpdateInterval?: number;
  originStreamName?: string | null;
  tickIntervalMs?: number;
}

export interface IMessageDbClientConfig {
  dbUri: string;
}
