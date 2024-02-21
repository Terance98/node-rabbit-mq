const amqp = require("amqplib");
const EventEmitter = require("events");
const { debounce } = require("./debounce");
require("dotenv").config();

class RabbitMQClient extends EventEmitter {
  // Private static property to store the connection promise
  static #connectionPromise;
  static #queueChannels = {};
  static #closeListenerSetup = false;
  static #reconnectAttempt = 0;
  static #connectionOptions = {
    hostname: process.env.RMQ_SERVICE_IP,
    port: process.env.RMQ_SERVICE_PORT,
    heartbeat: process.env.RMQ_SERVICE_HEARTBEAT,
  };
  // Private instance properties
  #queue;
  #channel;
  #mode;

  /**
   * Constructor for RabbitMQClient instances.
   * @param {string} queue - The name of the RabbitMQ queue to consume messages from.
   * @param {function} dataHandler - The callback function to handle incoming data.
   */
  constructor(queue, mode) {
    super();
    // Initialize private instance properties
    this.#queue = queue;
    this.#mode = mode;
  }

  /**
   * Private static method to establish a connection to RabbitMQ.
   * This function is a recursive function that will resolve only once a connection is established
   * @returns {Promise} A promise that resolves to the RabbitMQ connection.
   */
  static async #connectToRabbitMQ() {
    // Check if there is no existing connection promise
    if (!RabbitMQClient.#connectionPromise) {
      const logPrefix = `Attempt:${RabbitMQClient.#reconnectAttempt++}::`;
      // Create a new connection promise
      RabbitMQClient.#connectionPromise = amqp
        .connect(RabbitMQClient.#connectionOptions)
        .then((connection) => {
          console.log(
            `${logPrefix}:Successfully connected to RabbitMQ server!`
          );
          RabbitMQClient.#reconnectAttempt = 0;
          return connection;
        })
        .catch((err) => {
          console.log(`${logPrefix}:Unable to connect to RabbitMQ server`, {
            err,
          });
          // Recursively try to connect again after a few seconds
          return new Promise((resolve) => {
            setTimeout(() => {
              RabbitMQClient.#connectionPromise = null;
              resolve(this.#connectToRabbitMQ());
            }, 5000);
          });
        });
    }

    // Return the existing or newly created connection promise
    return RabbitMQClient.#connectionPromise;
  }

  /**
   * This function retries and establishes the connection again
   */
  #clearGlobalSettings(err) {
    console.log("Connection closed! Retrying...", { err });
    RabbitMQClient.#closeListenerSetup = false;
    RabbitMQClient.#connectionPromise = null;
    RabbitMQClient.#queueChannels = {};
  }

  // Debounced version of #clearGlobalSettings to avoid concurrent invocations
  #debouncedClearGlobalSettings = debounce(this.#clearGlobalSettings, 100);
  #debouncedInit = debounce(() => {
    this.#channel = null;
    return this.init();
  }, 250);

  /**
   * Private instance method to get the #channel for RabbitMQClient.
   */
  async #getChannel() {
    const connection = await RabbitMQClient.#connectToRabbitMQ();

    if (!RabbitMQClient.#closeListenerSetup) {
      RabbitMQClient.#closeListenerSetup = true;
      connection.on("close", (err) => this.#debouncedClearGlobalSettings(err));
      connection.on("error", (err) => this.#debouncedClearGlobalSettings(err));
      connection.on("blocked", (reason) => {
        console.warn("Connection blocked:", reason);
      });
      connection.on("unblocked", () => {
        console.log("Connection unblocked");
      });
    }

    connection.on("close", () => this.#debouncedInit());
    connection.on("error", () => this.#debouncedInit());

    if (!RabbitMQClient.#queueChannels[this.#queue]) {
      RabbitMQClient.#queueChannels[this.#queue] = new Promise(
        async (resolve, reject) => {
          try {
            // Create a #channel for communication
            const channel = await connection.createChannel();
            // Declare the queue with specified options
            await channel.assertQueue(this.#queue, { durable: false });
            resolve(channel);
          } catch (err) {
            console.log("Error in #channel creation", {
              err,
              queue: this.#queue,
              mode: this.#mode,
            });
            reject(err);
          }
        }
      );
    }

    return RabbitMQClient.#queueChannels[this.#queue];
  }

  /**
   * Function to setup a connection and #channel for communication
   */
  async init() {
    if (!["publisher", "consumer"].includes(this.#mode))
      throw new Error(
        "Invalid value for mode. Accepts `publisher` or `consumer`"
      );

    if (this.#channel) return;
    this.#channel = await this.#getChannel();

    if (this.#mode === "consumer") {
      this.#setConsumer();
    }
  }

  /**
   * Private instance method to set up the message consumer.
   */
  #setConsumer() {
    this.#channel.consume(
      this.#queue,
      (msg) => this.#queueMessageHandler(msg),
      {
        noAck: false,
      }
    );
  }

  /**
   * Private instance method to handle incoming messages from the queue.
   * @param {object} msg - The message object received from the queue.
   */
  #queueMessageHandler(msg) {
    if (msg.content) {
      // Acknowledge the receipt of the message
      this.#channel.ack(msg);

      const parsedMsg = JSON.parse(msg.content.toString());
      const { eventName, payload } = parsedMsg;
      // Emit a message event
      this.emit(eventName, payload);
    }
  }

  async sendData(eventName, payload) {
    if (!payload || !eventName) {
      throw new Error(
        "Invalid payload or eventName received. Skipping message send..."
      );
    }

    if (!this.#channel) {
      this.#channel = await this.#getChannel();
    }

    if (typeof payload !== "string") {
      try {
        const stringifiedPayload = JSON.stringify(payload);
        payload = stringifiedPayload;
      } catch (err) {
        throw new Error(
          "Received a non-string payload that is unable to stringify"
        );
      }
    }

    const message = {
      eventName,
      payload,
    };

    const stringifiedMessage = JSON.stringify(message);
    return this.#channel.sendToQueue(
      this.#queue,
      Buffer.from(stringifiedMessage)
    );
  }

  /**
   * This function sends message to the queue
   * @param {*} message
   * @returns true/false
   */
  async sendMessage(message) {
    return this.sendData("message", message);
  }
}

class RabbitMQPublisher extends RabbitMQClient {
  constructor(queue) {
    super(queue, "publisher");
  }
}

class RabbitMQConsumer extends RabbitMQClient {
  constructor(queue) {
    super(queue, "consumer");
  }
}

module.exports = { RabbitMQPublisher, RabbitMQConsumer };
