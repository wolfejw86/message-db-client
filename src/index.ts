import uuid from 'uuid';
import pg from 'pg';
import Bluebird from 'bluebird';
import { EventEmitter } from 'events';

import { StreamVersionConflictError } from './errors';
import {
  MessageHandler,
  IEventStreamSubscriptionConfig,
  IMessageDbClientConfig,
  IStreamMessage,
} from './interfaces';

class EventStreamSubscription<T extends MessageHandler> {
  private streamName: string;
  private handlers: T;
  private messagesPerTick: number;
  private positionUpdateInterval: number;
  private originStreamName: string | null;
  private tickIntervalMs: number;
  private subscriberPositionStream: string;
  private messageDbClient: MessageDbClient;

  private events = new EventEmitter();
  private currentPosition = 0;
  private messagesSinceLastPositionWrite = 0;
  private keepGoing = true;

  constructor(
    messageDbClient: MessageDbClient,
    {
      streamName,
      handlers,
      subscriberId,
      messagesPerTick = 100,
      positionUpdateInterval = 100,
      originStreamName = null,
      tickIntervalMs = 100,
    }: IEventStreamSubscriptionConfig<T>
  ) {
    this.handlers = handlers;
    this.streamName = streamName;
    this.messagesPerTick = messagesPerTick;
    this.positionUpdateInterval = positionUpdateInterval;
    this.originStreamName = originStreamName;
    this.tickIntervalMs = tickIntervalMs;
    this.messageDbClient = messageDbClient;
    this.subscriberPositionStream = `subscriberPosition-${subscriberId}`;
  }

  public start() {
    return this.poll();
  }

  public stop() {
    this.keepGoing = false;

    return new Promise(resolve => {
      this.events.once('shutdown', resolve);
    });
  }

  private async poll() {
    await this.loadPosition();

    while (this.keepGoing) {
      const messagesProcessed = await this.tick();

      if (messagesProcessed === 0) {
        await Bluebird.delay(this.tickIntervalMs);
      }
    }

    this.events.emit('shutdown');
  }

  private loadPosition() {
    return this.messageDbClient
      .readLastMessage(this.subscriberPositionStream)
      .then(message => {
        this.currentPosition = message ? message.data.position : 0;
      })
      .catch(err => {
        console.log(err);
        throw err;
      });
  }

  private writePosition = (position: number) => {
    const positionEvent = {
      id: uuid.v4(),
      type: 'Read',
      data: { position },
    };

    return this.messageDbClient.writeToStream(
      this.subscriberPositionStream,
      positionEvent
    );
  };

  private updateReadPosition = async (position: number) => {
    this.currentPosition = position;
    this.messagesSinceLastPositionWrite += 1;

    if (this.messagesSinceLastPositionWrite === this.positionUpdateInterval) {
      this.messagesSinceLastPositionWrite = 0;

      await this.writePosition(position);
    }
  };

  private async handleMessage(message: any) {
    const handler = this.handlers[message.type] || this.handlers.$any;

    if (handler) {
      return handler(message);
    }
  }

  private processBatch = (messages: any[]) =>
    Bluebird.each(messages, message =>
      this.handleMessage(message).then(() =>
        this.updateReadPosition(message.globalPosition)
      )
    ).then(() => messages.length);

  private getCategoryName = (streamName?: string | null) => {
    if (streamName == null) {
      return '';
    }

    return streamName.split('-')[0];
  };

  private filterByOriginSubscription = (messages: any[]) => {
    if (!this.originStreamName) {
      return messages;
    }

    return messages.filter(message => {
      const originCategory =
        message.metadata &&
        this.getCategoryName(message.metadata.originStreamName);

      return this.originStreamName === originCategory;
    });
  };

  private getNextBatchOfMessages() {
    return this.messageDbClient
      .readStream(
        this.streamName,
        this.currentPosition + 1,
        this.messagesPerTick
      )
      .then(this.filterByOriginSubscription);
  }

  private tick() {
    return this.getNextBatchOfMessages()
      .then(this.processBatch)
      .catch((err: any) => {
        // eslint-disable-next-line no-console
        console.error('Error processing batch', err);

        this.stop();
      });
  }
}

type Projection = { [key: string]: (...args: any[]) => any };

export class MessageDbClient {
  private queries = {
    writeFunction: 'SELECT message_store.write_message($1, $2, $3, $4, $5, $6)',
    getCategoryMessages: 'SELECT * FROM get_category_messages($1, $2, $3)',
    getStreamMessages: 'SELECT * FROM get_stream_messages($1, $2, $3)',
    getLastMessage: 'SELECT * FROM get_last_stream_message($1)',
    getAllMessages: `
      SELECT 
        id::varchar,
        stream_name::varchar,
        type::varchar,
        position::bigint,
        global_position::bigint,
        data::varchar,
        metadata::varchar,
        time::timestamp
      FROM
        messages
      WHERE
        global_position > $1 
      LIMIT $2`,
  };

  private db: pg.Client;
  private eventSubscriptions: EventStreamSubscription<MessageHandler>[] = [];

  constructor(config: IMessageDbClientConfig) {
    this.db = new pg.Client({
      connectionString: config.dbUri,
    });

    this.db
      .connect()
      .then(() => this.db.query('SET search_path = message_store, public'))
      .then(() => console.log('Initialized message store'));
  }

  public writeToStream(
    streamName: string,
    message: any,
    expectedVersion?: any
  ) {
    if (!message.type) {
      throw new Error('Messages must have a type');
    }

    const writeValues = [
      message.id,
      streamName,
      message.type,
      message.data,
      message.metadata,
      expectedVersion,
    ];

    return this.db.query(this.queries.writeFunction, writeValues).catch(err => {
      const errorMatch = err.message.match(
        StreamVersionConflictError.SQL_ERROR_MSG_RE
      );
      const notVersionConflict = errorMatch === null;

      if (notVersionConflict) {
        throw err;
      }

      const actualVersion = parseInt(errorMatch[1], 10);
      const streamVersionConflictErr = new StreamVersionConflictError(
        streamName,
        expectedVersion,
        actualVersion
      );

      streamVersionConflictErr.stack += err.stack;

      throw streamVersionConflictErr;
    });
  }

  public readStream(streamName: string, fromPosition = 0, maxMessages = 1000) {
    let query = null;
    let values = [];

    if (streamName === '$all') {
      query = this.queries.getAllMessages;
      values = [fromPosition, maxMessages];
    } else {
      if (streamName.includes('-')) {
        // Entity streams have a dash
        query = this.queries.getStreamMessages;
        values = [streamName, fromPosition, maxMessages];
      } else {
        // Category streams do not have a dash
        query = this.queries.getCategoryMessages;
        values = [streamName, fromPosition, maxMessages];
      }
    }

    return this.db
      .query(query, values)
      .then(res => res.rows.map(MessageDbClient.deserializeMessage));
  }

  /**
   * temporary load entity function - needs much more robust interface
   */
  public loadEntity(streamName: string, projection: Projection) {
    return this.readStream(streamName).then(messages =>
      this.project(messages, projection)
    );
  }

  /**
   * used with loadEntity - temporary until sourced integration
   */
  private project = (events: any[], projection: Projection) => {
    return events.reduce((entity, event) => {
      if (!projection[event.type]) {
        return entity;
      }

      return projection[event.type](entity, event);
    }, projection.$init());
  };

  /**
   * Returns the last message written to a stream
   * @param streamName name of stream - will not work on
   */
  public readLastMessage(streamName: string) {
    return this.db
      .query(this.queries.getLastMessage, [streamName])
      .then(res => MessageDbClient.deserializeMessage(res.rows[0]));
  }

  public createSubscriber<T extends MessageHandler>(
    subscriberConfig: IEventStreamSubscriptionConfig<T>
  ) {
    const sub = new EventStreamSubscription(this, subscriberConfig);

    this.eventSubscriptions.push(sub);

    return sub;
  }

  public async shutdown() {
    for (const sub of this.eventSubscriptions) {
      await sub.stop();
    }

    return this.db.end();
  }

  private static deserializeMessage(rawMessage: any) {
    if (!rawMessage) {
      return null;
    }

    return {
      id: rawMessage.id,
      streamName: rawMessage.stream_name,
      type: rawMessage.type,
      position: parseInt(rawMessage.position, 10),
      globalPosition: parseInt(rawMessage.global_position, 10),
      data: rawMessage.data ? JSON.parse(rawMessage.data) : {},
      metadata: rawMessage.metadata ? JSON.parse(rawMessage.metadata) : {},
      time: rawMessage.time,
    };
  }
}

export function formatStreamMessage<TType, TData, TMeta>(
  type: TType,
  data: TData,
  metadata?: TMeta,
  id = uuid.v4()
): IStreamMessage<TType, TData, TMeta> {
  return {
    id,
    type,
    data,
    metadata,
  };
}
