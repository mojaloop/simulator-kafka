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

This is the official list of the Mojaloop project contributors for this file.
Names of the original copyright holders (individuals or organizations)
should be listed with a '*' in the first column. People who have
contributed from an organization can be listed under the organization
that actually holds the copyright for their contributions (see the
their names indented and be marked with a '-'. Email address can be added
optionally within square brackets <email>.
* ModusBox
- Shashikant Hiruagde <shashikant.hirugade@modusbox.com>
- Miguel de Barros <miguel.debarros@modusbox.com>
*****/

/**
 * @module src/shared/setup
 */

'use strict'

const Config = require('../lib/config')
const Metrics = require('@mojaloop/central-services-metrics')
const Api = require('../api')
const Endpoints = require('@mojaloop/central-services-shared').Util.Endpoints

const initInstrumentation = async () => {
  if (!Config.INSTRUMENTATION_METRICS_DISABLED) {
    Metrics.setup(Config.INSTRUMENTATION_METRICS_CONFIG)
  }
}

const initAPI = async (hostname, port, apiDisabled) => {
  if (!apiDisabled) {
    return Api.init(hostname, port)
  }
  return undefined
}


/**
 * @function init
 * @async
 * @description Setup method for API, Admin and Handlers. Note that the Migration scripts are called before connecting to the database to ensure all new tables are loaded properly.
 * @property {boolean} apiDisabled True|False to indicate if the Handler should be registered
 */
const init = async (hostname, port, apiDisabled = true) => {
  await initInstrumentation()
  await Endpoints.initializeCache(Config.ENDPOINT_CACHE_CONFIG)
  await initAPI(hostname, port, apiDisabled)
}

module.exports = { init, initInstrumentation }
