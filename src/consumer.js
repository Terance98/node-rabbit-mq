require("dotenv").config();
const { RabbitMQConsumer } = require("./helpers");

async function runIt() {
  const rmqConsumer = new RabbitMQConsumer("test_channel");
  await rmqConsumer.init();

  rmqConsumer.on("message", (message) => {
    console.log("GOT DATA: ", { message });
  });
}

runIt();
