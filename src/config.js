/**
 * @property {function()} argv
 * @property {function(object)} defaults
 * @property {function(string)} get
 * @property {function(string, string)} set
 */
const path = require('path')
const nConf = require('nconf')

// First consider commandline arguments and environment variables, respectively.
nConf
    .argv()
    .env()

    // Then load configuration from the file shipped next to this module,
    // so it is found regardless of the current working directory.
    .file({ file: path.join(__dirname, 'config.json') })

    // Provide default values for settings not provided above.
    .defaults({
        "port": 3000,
        "max_publishing_topics_counts": 2,
        "max_subscription_topics_counts": 20,
        "keepAliveInterval": 40
    })

module.exports = nConf
