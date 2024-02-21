const { RabbitMQPublisher } = require("./helpers");
require("dotenv").config();

async function runIt() {
  const rmqPublisher = new RabbitMQPublisher("test_channel");
  await rmqPublisher.init();

  const message = { userId: "123", message: "hellooooo from server!!" };
  console.log("Publishing data on test_channel: ", JSON.stringify(message));
  rmqPublisher.sendMessage(message);
}

runIt();
