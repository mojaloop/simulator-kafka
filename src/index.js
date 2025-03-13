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
Miguel de Barros <miguel.debarros@modusbox.com>
*****/

'use strict'

// TO BE DONE
// CLI to start Producer or Consumer
// Also startup HTTP Server to expose /health and /metric end-points
// Instantiate metrics lib

const PJson = require('../package.json')
const Logger = require('@mojaloop/central-services-logger')
const { Command } = require('commander')
const startConsumer = require('./consumer-to-command').startConsumer
const Setup = require('./shared/setup').init
const Config = require('./lib/config')

const Program = new Command()

Program
  .version(PJson.version)
  .description(PJson.description)

Program.command('connect')// sub-command name, coffeeType = type, required
  .alias('c') // alternative sub-command is 'o'
  .description('Start service') // command description
  .option('--type <name>', 'Messages type to consume')
  .option('--action <name>', 'Message action to consume')
  .option('--produceToTopic <name>', 'Topic to produce the answer to')

  // function to execute when command is uses
  .action(async (args) => {
    // Logger.info(`Program.command('produce').args=${Flatted.stringify(args)}`)
    let type
    let action
    let produceToTopic

    if (args.type) {
      Logger.info(`message type to create topic = ${args.type}`)
      type = args.type
    }

    if (args.action) {
      Logger.info(`message action to create topic = ${args.action}`)
      action = args.action
    }

    if (args.produceToTopic) {
      Logger.info(`Topic to produce to = ${args.produceToTopic}`)
      produceToTopic = args.produceToTopic
    }

    try {
      // await startConsumer(type, action, produceToTopic)
      await Promise.all([Setup(Config.HOSTNAME, Config.PORT, false), startConsumer(type, action, produceToTopic)])
    } catch (err) {
      Logger.error(err)
    }
  })


if (Array.isArray(process.argv) && process.argv.length > 2) {
  // parse command line vars
  Program.parse(process.argv)
} else {
  // display default help
  Program.help()
}

