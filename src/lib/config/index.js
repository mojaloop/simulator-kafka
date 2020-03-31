const RC = require('parse-strings-in-object')(require('rc')('CSS', require('../../../config/default.json')))

// console.log(JSON.stringify(RC))
// Set config object to be returned
const config = {
  KAFKA_CONFIG: RC.KAFKA,
  INSTRUMENTATION_METRICS_DISABLED: RC.INSTRUMENTATION.METRICS.DISABLED,
  INSTRUMENTATION_METRICS_CONFIG: RC.INSTRUMENTATION.METRICS.config,
  HOSTNAME: RC.HOSTNAME,
  PORT: RC.PORT,
  ENDPOINT_SOURCE_URL: RC.ENDPOINT_SOURCE_URL,
  ENDPOINT_CACHE_CONFIG: RC.ENDPOINT_CACHE_CONFIG
}

module.exports = config
