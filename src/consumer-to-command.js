/*****
License
--------------
Copyright © 2020-2025 Mojaloop Foundation
The Mojaloop files are made available by the Mojaloop Foundation under the Apache License, Version 2.0 (the "License") and you may not use these files except in compliance with the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, the Mojaloop files are distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

Contributors
--------------
This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
Mojaloop Foundation for an example). Those individuals should have
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.

* Mojaloop Foundation
- Name Surname <name.surname@mojaloop.io>

* Georgi Georgiev <georgi.georgiev@modusbox.com>
* Shashikant Hirugade <shashikant.hirugade@modusbox.com>
* Steven Oderayi <steven.oderayi@modusbox.com>
*****/

'use strict'

const Consumer = require('@mojaloop/central-services-stream').Kafka.Consumer
const Logger = require('@mojaloop/central-services-logger')
const EventSdk = require('@mojaloop/event-sdk')
const ErrorHandler = require('@mojaloop/central-services-error-handling')
const KafkaUtil = require('@mojaloop/central-services-shared').Util.Kafka
const Metrics = require('@mojaloop/central-services-metrics')
const ENUM = require('@mojaloop/central-services-shared').Enum
const { decodePayload, isDataUri } = require('@mojaloop/central-services-shared').Util.StreamingProtocol
const { createCallbackHeaders } = require('./lib/headers')
const Config = require('./lib/config')
const Commands = require('./commands')
const Participant = require('./domain/participant')
let notificationConsumer = {}
let autoCommitEnabled = true

const LOG_ENABLED = false

const recordTxMetrics = (t_api_prepare, t_api_fulfil, success) => {
  const endTime = Date.now()
  if (t_api_prepare && !t_api_fulfil) {
    const histTracePrepareTimerEnd = Metrics.getHistogram(
      'tx_transfer_prepare',
      'Tranxaction metrics for Transfers - Prepare Flow',
      ['success']
    )
    histTracePrepareTimerEnd.observe({ success }, (endTime - t_api_prepare)/1000)
  }
  if (t_api_fulfil) {
    const histTraceFulfilTimerEnd = Metrics.getHistogram(
      'tx_transfer_fulfil',
      'Tranxaction metrics for Transfers - Fulfil Flow',
      ['success']
    )
    histTraceFulfilTimerEnd.observe({ success }, (endTime - t_api_fulfil)/1000)
  }
  if (t_api_prepare && t_api_fulfil) {
    const histTraceEnd2EndTimerEnd = Metrics.getHistogram(
      'tx_transfer',
      'Tranxaction metrics for Transfers - End-to-end Flow',
      ['success']
    )
    histTraceEnd2EndTimerEnd.observe({ success }, (endTime - t_api_prepare)/1000)
  }
}

/**
 * @module src/handlers/notification
 */

/**
 * @function startConsumer
 * @async
 * @description This will create a kafka consumer which will listen to the notification topics configured in the config
 *
 * @returns {boolean} Returns true on success and throws error on failure
 */

const startConsumer = async (type = ENUM.Events.Event.Type.NOTIFICATION, action = ENUM.Events.Event.Action.EVENT) => {
  Logger.info('Notification::startConsumer')
  let topicName
  try {
    const topicConfig = KafkaUtil.createGeneralTopicConf(Config.KAFKA_CONFIG.TOPIC_TEMPLATES.GENERAL_TOPIC_TEMPLATE.TEMPLATE, type, action)
    topicName = topicConfig.topicName
    Logger.info(`Notification::startConsumer - starting Consumer for topicNames: [${topicName}]`)
    const config = KafkaUtil.getKafkaConfig(Config.KAFKA_CONFIG, ENUM.Kafka.Config.CONSUMER, type.toUpperCase(), action.toUpperCase())
    config.rdkafkaConf['client.id'] = topicName

    if (config.rdkafkaConf['enable.auto.commit'] !== undefined) {
      autoCommitEnabled = config.rdkafkaConf['enable.auto.commit']
    }
    notificationConsumer = new Consumer([topicName], config)
    await notificationConsumer.connect()
    Logger.info(`Notification::startConsumer - Kafka Consumer connected for topicNames: [${topicName}]`)
    await notificationConsumer.consume(consumeMessage)
    Logger.info(`Notification::startConsumer - Kafka Consumer created for topicNames: [${topicName}]`)
    return true
  } catch (err) {
    Logger.error(`Notification::startConsumer - error for topicNames: [${topicName}] - ${err}`)
    const fspiopError = ErrorHandler.Factory.reformatFSPIOPError(err)
    Logger.error(fspiopError)
    throw fspiopError
  }
}

/**
 * @function consumeMessage
 * @async
 * @description This is the callback function for the kafka consumer, this will receive the message from kafka, commit the message and send it for processing
 * processMessage - called to process the message received from kafka
 * @param {object} error - the error message received form kafka in case of error
 * @param {object} message - the message received form kafka

 * @returns {boolean} Returns true on success or false on failure
 */
const consumeMessage = async (error, message) => {
  Logger.info('Notification::consumeMessage')
  const histTimerEnd = Metrics.getHistogram(
    'notification_event',
    'Consume a notification message from the kafka topic and process it accordingly',
    ['success', 'error']
  ).startTimer()
  let t_api_prepare
  let t_api_fulfil
  try {
    if (error) {
      const fspiopError = ErrorHandler.Factory.createInternalServerFSPIOPError(`Error while reading message from kafka ${error}`, error)
      Logger.error(fspiopError)
      throw fspiopError
    }
    Logger.info(`Notification:consumeMessage message: - ${JSON.stringify(message)}`)

    message = (!Array.isArray(message) ? [message] : message)
    let combinedResult = true
    for (const msg of message) {
      Logger.info('Notification::consumeMessage::processMessage')
      const contextFromMessage = EventSdk.Tracer.extractContextFromMessage(msg.value)
      const span = EventSdk.Tracer.createChildSpanFromContext('ml_notification_event', contextFromMessage)
      const traceTags = span.getTracestateTags()
      if (traceTags['t_api_prepare'] && parseInt(traceTags['t_api_prepare'])) t_api_prepare = parseInt(traceTags['t_api_prepare'])
      if (traceTags['t_api_fulfil'] && parseInt(traceTags['t_api_fulfil'])) t_api_fulfil = parseInt(traceTags['t_api_fulfil'])
      try {
        await span.audit(msg, EventSdk.AuditEventAction.start)
        const res = await processMessage(msg, span).catch(err => {
          const fspiopError = ErrorHandler.Factory.createInternalServerFSPIOPError('Error processing notification message', err)
          Logger.error(fspiopError)
          if (!autoCommitEnabled) {
            notificationConsumer.commitMessageSync(msg)
          }
          throw fspiopError // We return 'resolved' since we have dealt with the error here
        })
        if (!autoCommitEnabled) {
          notificationConsumer.commitMessageSync(msg)
        }
        Logger.debug(`Notification:consumeMessage message processed: - ${res}`)
        combinedResult = (combinedResult && res)
      } catch (err) {
        const fspiopError = ErrorHandler.Factory.reformatFSPIOPError(err)
        const state = new EventSdk.EventStateMetadata(EventSdk.EventStatusType.failed, fspiopError.apiErrorCode.code, fspiopError.apiErrorCode.message)
        await span.error(fspiopError, state)
        await span.finish(fspiopError.message, state)
        throw fspiopError
      } finally {
        if (!span.isFinished) {
          await span.finish()
        }
      }
    }
    // TODO: calculate end times - report end-to-time
    //
    recordTxMetrics(t_api_prepare, t_api_fulfil, true)
    histTimerEnd({ success: true })
    return combinedResult
  } catch (err) {
    const fspiopError = ErrorHandler.Factory.reformatFSPIOPError(err)
    Logger.error(fspiopError)
    recordTxMetrics(t_api_prepare, t_api_fulfil, false)

    const getRecursiveCause = (error) => {
      if (error.cause instanceof ErrorHandler.Factory.FSPIOPError) {
        return getRecursiveCause(error.cause)
      } else if (error.cause instanceof Error) {
        if (error.cause) {
          return error.cause
        } else {
          return error.message
        }
      } else if (error.cause) {
        return error.cause
      } else if (error.message) {
        return error.message
      } else {
        return error
      }
    }
    const errCause = getRecursiveCause(err)
    histTimerEnd({ success: false, error: errCause})
    throw fspiopError
  }
}

/**
 * @function processMessage
 * @async
 * @description This is the function that will process the message received from kafka, it determined the action and status from the message and sends calls to appropriate fsp
 * Callback.sendCallback - called to send the notification callback
 * @param {object} msg - the message received form kafka
 * @param {object} span - the parent event span
 *
 * @returns {boolean} Returns true on sucess and throws error on failure
 */

const processMessage = async (msg, span) => {
  const histTimerEnd = Metrics.getHistogram(
    'notification_event_process_msg',
    'Consume a notification message from the kafka topic and process it accordingly',
    ['success', 'action']
  ).startTimer()
  Logger.info('Notification::processMessage')
  if (!msg.value || !msg.value.content || !msg.value.content.headers || !msg.value.content.payload) {
    histTimerEnd({ success: false, action: 'unknown' })
    throw ErrorHandler.Factory.createInternalServerFSPIOPError('Invalid message received from kafka')
  }

  const { metadata, from, to, content } = msg.value
  const { action, state } = metadata.event
  const status = state.status
  const fromSwitch = true

  const actionLower = action.toLowerCase()
  const statusLower = status.toLowerCase()

  Logger.info('Notification::processMessage action: ' + action)
  Logger.info('Notification::processMessage status: ' + status)
  const decodedPayload = decodePayload(content.payload, { asParsed: false })
  const id = JSON.parse(decodedPayload.body.toString()).transferId || (content.uriParams && content.uriParams.id)
  let payloadForCallback
  let callbackHeaders

  if (isDataUri(content.payload)) {
    payloadForCallback = decodedPayload.body.toString()
  } else {
    const parsedPayload = JSON.parse(decodedPayload.body)
    if (parsedPayload.errorInformation) {
      payloadForCallback = JSON.stringify(ErrorHandler.CreateFSPIOPErrorFromErrorInformation(parsedPayload.errorInformation).toApiErrorObject(Config.ERROR_HANDLING))
    } else {
      payloadForCallback = decodedPayload.body.toString()
    }
  }

  if (actionLower === ENUM.Events.Event.Action.PREPARE && statusLower === ENUM.Events.EventStatus.SUCCESS.status) {
    const callbackURLTo = await Participant.getEndpoint(to, ENUM.EndPoints.FspEndpointTypes.FSPIOP_CALLBACK_URL_TRANSFER_POST, id, span)
    callbackHeaders = createCallbackHeaders({ dfspId: to, transferId: id, headers: content.headers, httpMethod: ENUM.Http.RestMethods.PUT, endpointTemplate: ENUM.EndPoints.FspEndpointTemplates.TRANSFERS_PUT_ERROR }, fromSwitch)
    !!LOG_ENABLED && Logger.debug(`Notification::processMessage - Callback.sendRequest(${callbackURLTo}, ${ENUM.Http.RestMethods.POST}, ${JSON.stringify(content.headers)}, ${payloadForCallback}, ${id}, ${from}, ${to})`)
    Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::prepare::message - START`)
    let response = { status: 'unknown' }
    const histTimerEndSendRequest = Metrics.getHistogram(
      'notification_event_delivery',
      'notification_event_delivery - metric for sending notification requests to FSPs',
      ['success', 'from', 'to', 'dest', 'action', 'status']
    ).startTimer()
    try {
      await Commands.produceFulfilMessage(callbackHeaders, payloadForCallback, ENUM.Http.RestMethods.PUT, from, to, span)
    } catch (err) {
      Logger.error(err)
      Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::prepare::message - END`)
      histTimerEndSendRequest({ success: false, from, dest: to, action, status: response.status })
      histTimerEnd({ success: false, action })
      throw err
    }
    histTimerEndSendRequest({ success: true, from, dest: to, action, status: 'success',  status: response.status })
    Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::prepare::message - END`)
    histTimerEnd({ success: true, action })
    return true
  }

  if (actionLower === ENUM.Events.Event.Action.COMMIT && statusLower === ENUM.Events.EventStatus.SUCCESS.status) {
    const callbackURLTo = await Participant.getEndpoint(to, ENUM.EndPoints.FspEndpointTypes.FSPIOP_CALLBACK_URL_TRANSFER_PUT, id, span)
    callbackHeaders = createCallbackHeaders({ dfspId: to, transferId: id, headers: content.headers, httpMethod: ENUM.Http.RestMethods.PUT, endpointTemplate: ENUM.EndPoints.FspEndpointTemplates.TRANSFERS_PUT })
    // forward the fulfil to the destination
    !!LOG_ENABLED && Logger.debug(`Notification::processMessage - Callback.sendRequest(${callbackURLTo}, ${ENUM.Http.RestMethods.PUT}, ${JSON.stringify(callbackHeaders)}, ${payloadForCallback}, ${id}, ${from}, ${to})`)
    Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::commit::message1 - START`)
    let response = { status: 'unknown' }
    const histTimerEndSendRequest = Metrics.getHistogram(
      'notification_event_delivery',
      'notification_event_delivery - metric for sending notification requests to FSPs',
      ['success', 'from', 'dest', 'action', 'status']
    ).startTimer()
    // try {
    //   response = await Callback.sendRequest(callbackURLTo, callbackHeaders, from, to, ENUM.Http.RestMethods.PUT, payloadForCallback, ENUM.Http.ResponseTypes.JSON, span)
    // } catch (err) {
    //   Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::commit::message - END`)
    //   histTimerEndSendRequest({ success: false, from, dest: to, action, status: response.status})
    //   histTimerEnd({ success: false, action })
    //   throw err
    // }
    histTimerEndSendRequest({ success: true, from, dest: to, action,  status: response.status })
    Logger.error(`[cid=${id}, fsp=${from}, source=${from}, dest=${to}] ~ ML-Notification::commit::message1 - END`)
    histTimerEnd({ success: true, action })
    return true
  }
  return true
}


module.exports = {
  startConsumer,
  processMessage,
  consumeMessage
}
