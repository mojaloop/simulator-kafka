const startConsumer = require('./consumer-to-command').startConsumer

const main = async () => {
  await startConsumer('notification', 'event', 'produceToTopic')
}

main()