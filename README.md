# simulated-message-handler
PoC in Experimental stage of DFSP simulator that runs on kafka:
* Consumes prepare message from notification topic and produces back to fulfil topic.
* Consumes fulfil message from notification topic and records metrics

Only Golden Path (successful transfers) is currently covered. 

The tool runs by CLI interface.
Example: 
`$ node src/index.js connect --type notification --action event`
 
## Fulfilment values

The fulfilment is carried by the two enviromental variables, which have default values in the code as well.
`MOCK_JWS_SIGNATURE` and `TRANSFERS_FULFILMENT`

| enviromental variable | default value |
|-|-|
| MOCK_JWS_SIGNATURE | abcJjvNrkyK2KBieDUbGfhaBUn75aDUATNF4joqA8OLs4QgSD7i6EO8BIdy6Crph3LnXnTM20Ai1Z6nt0zliS_qPPLU9_vi6qLb15FOkl64DQs9hnfoGeo2tcjZJ88gm19uLY_s27AJqC1GH1B8E2emLrwQMDMikwQcYvXoyLrL7LL3CjaLMKdzR7KTcQi1tCK4sNg0noIQLpV3eA61kess |
TRANSFERS_FULFILMENT | XoSz1cL0tljJSCp_VtIYmPNw-zFUgGfbUqf69AagUzY |
