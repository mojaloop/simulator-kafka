const base64url = require('base64url')
const Logger = require('@mojaloop/central-services-logger')
const EventSdk = require('@mojaloop/event-sdk')
const ErrorHandler = require('@mojaloop/central-services-error-handling')
const { Headers } = require('@mojaloop/central-services-shared').Util
const Metrics = require('@mojaloop/central-services-metrics')
const Enum = require('@mojaloop/central-services-shared').Enum
const { encodePayload } = require('@mojaloop/central-services-shared').Util.StreamingProtocol
const { getTransferSpanTags } = require('@mojaloop/central-services-shared').Util.EventFramework

const TransferService = require('./domain/transfer')
const Validator = require('./lib/validator')

const signature = process.env.MOCK_JWS_SIGNATURE || 'abcJjvNrkyK2KBieDUbGfhaBUn75aDUATNF4joqA8OLs4QgSD7i6EO8BIdy6Crph3LnXnTM20Ai1Z6nt0zliS_qPPLU9_vi6qLb15FOkl64DQs9hnfoGeo2tcjZJ88gm19uLY_s27AJqC1GH1B8E2emLrwQMDMikwQcYvXoyLrL7LL3CjaLMKdzR7KTcQi1tCK4sNg0noIQLpV3eA61kess'
const transfersFulfilment = process.env.TRANSFERS_FULFILMENT || 'XoSz1cL0tljJSCp_VtIYmPNw-zFUgGfbUqf69AagUzY'

const LOG_ENABLED = !!(process.env.LOG_ENABLED)

const requestRawPayloadTransform = (request, payloadBuffer) => {
  try {
    return Object.assign(request, {
      payload: JSON.parse(payloadBuffer.toString()),
      dataUri: encodePayload(payloadBuffer, request.headers['content-type']),
      rawPayload: payloadBuffer
    })
  } catch (err) {
    Logger.error(err)
    throw ErrorHandler.Factory.reformatFSPIOPError(err)
  }
}

const encodeRequest = async (request) => {
  const rawBuffer = Buffer.from(request.payload)
  if (Buffer.byteLength(rawBuffer) !== 0) {
    request = requestRawPayloadTransform(request, rawBuffer)
  }
  return request
}

const fulfilTransfer = async function (request) {
  const histTimerEnd = Metrics.getHistogram(
    'transfer_fulfil',
    'Produce a transfer fulfil message to transfer fulfil kafka topic',
    ['success']
  ).startTimer()
  Logger.error(`[cid=${request.params.id}, fsp=${request.headers['fspiop-source']}, source=${request.headers['fspiop-source']}, dest=${request.headers['fspiop-destination']}] ~ ML-API::service::fulfilTransfer - START`)
  const span = request.span
  span.setTracestateTags({ t_api_fulfil: `${Date.now()}` })
  try {
    span.setTags(getTransferSpanTags(request, Enum.Events.Event.Type.TRANSFER, Enum.Events.Event.Action.FULFIL))
    // Validator.fulfilTransfer(request)
    !!LOG_ENABLED && Logger.debug('fulfilTransfer::payload(%s)', JSON.stringify(request.payload))
    !!LOG_ENABLED && Logger.debug('fulfilTransfer::headers(%s)', JSON.stringify(request.headers))
    Logger.debug('fulfilTransfer::id(%s)', request.params.id)
    await span.audit({
      headers: request.headers,
      dataUri: request.dataUri,
      payload: request.payload,
      params: request.params
    }, EventSdk.AuditEventAction.start)
    await TransferService.fulfil(request.headers, request.dataUri, request.payload, request.params, span)
    histTimerEnd({ success: true })
    return true
  } catch (err) {
    const fspiopError = ErrorHandler.Factory.reformatFSPIOPError(err)
    Logger.error(fspiopError)
    histTimerEnd({ success: false })
    throw fspiopError
  }
}

const produceFulfilMessage = async (headers, payload, method, source, destination, span) => {
  try {
    const transformedHeaders = Headers.transformHeaders(headers, {
      httpMethod: method,
      sourceFsp: source,
      destinationFsp: destination
    })

    const request = {
      headers: transformedHeaders,
      data: payload
    }

    const transferId = span.spanContext.tags.transactionId

    const fspiopUriHeader = `/transfers/${transferId}`
    const transfersResponse = {
      fulfilment: transfersFulfilment,
      completedTimestamp: new Date().toISOString(),
      transferState: 'COMMITTED'
    }
    const protectedHeader = {
      alg: 'RS256',
      'fspiop-source': `${request.headers['fspiop-destination']}`,
      'fspiop-destination': `${request.headers['fspiop-source']}`,
      'fspiop-uri': `/transfers/${transferId}`,
      'fspiop-http-method': 'PUT',
      Date: ''
    }
    const fspiopSignature = {
      signature: signature,
      protectedHeader: `${base64url.encode(JSON.stringify(protectedHeader))}`
    }

    const outHeaders = {
      'content-type': 'application/vnd.interoperability.transfers+json;version=1.0',
      'fspiop-source': request.headers['fspiop-destination'],
      'fspiop-destination': request.headers['fspiop-source'],
      Date: new Date().toUTCString(),
      'fspiop-signature': JSON.stringify(fspiopSignature),
      'fspiop-http-method': 'PUT',
      'fspiop-uri': fspiopUriHeader
      // traceparent: request.headers.traceparent ? request.headers.traceparent : undefined,
      // tracestate: request.headers.tracestate ? request.headers.tracestate : undefined
    }

    const data = JSON.stringify(transfersResponse)

    const outgoing = {
      headers: outHeaders,
      data
    }

    const extendedRequest = await encodeRequest({ headers: outgoing.headers, payload: outgoing.data, params: { id: transferId } })
    extendedRequest.span = span
    fulfilTransfer(extendedRequest)
  } catch (e) {
    Logger.error(e.stack)
  }
}

module.exports = {
  produceFulfilMessage
}
