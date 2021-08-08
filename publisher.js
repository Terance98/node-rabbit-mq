const amqp = require("amqplib");
const num = process.argv[2];
const msg = { number: num };

connect();

async function connect() {
  try {
    const connection = await amqp.connect("amqp://localhost:5672");
    const channel = await connection.createChannel();
    const result = await channel.assertQueue("jobs");
    channel.sendToQueue("jobs", Buffer.from(JSON.stringify(msg)));
    console.log(`Job sent succesfully ${msg.number}`);
  } catch (err) {
    console.error(err);
  }
}
