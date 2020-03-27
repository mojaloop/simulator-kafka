'use strict'

const Producer = require('@mojaloop/central-services-stream').Kafka.Producer
const Logger = require('@mojaloop/central-services-logger')

const createProducer = async (config) => {
  Logger.debug('createProducer::start')

  // set the logger
  config.logger = Logger

  var p = new Producer(config)

  Logger.info('createProducer::- Connecting...')
  var connectionResult = await p.connect()
  Logger.info(`createProducer::- Connected result=${connectionResult}`)

  Logger.debug('createProducer::end')
  return p
}

exports.createProducer = createProducer
