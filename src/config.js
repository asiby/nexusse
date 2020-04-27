/**
 * @property {function()} argv
 * @property {function(object)} defaults
 * @property {function(string)} get
 * @property {function(string, string)} set
 */
const nConf = require('nconf')

// First consider commandline arguments and environment variables, respectively.
nConf
    .argv()
    .env()

    // Then load configuration from a designated file.
    .file({ file: 'config.json' })

    // Provide default values for settings not provided above.
    .defaults({
        "port": 3000,
        "max_publishing_topics_counts": 2,
        "max_subscription_topics_counts": 20,
        "keep_alive_interval": 40
    })

module.exports = nConf
