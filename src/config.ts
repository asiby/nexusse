import nConf from 'nconf'
import fileConfig from './config.json'

export type Config = nConf.Provider

// First consider commandline arguments and environment variables, respectively.
nConf
    .argv()
    .env()

    // Runtime changes made through set(). nconf writes to every writable
    // store, and the literal store below is read-only.
    .add('runtime', { type: 'memory' })

    // Then the configuration file shipped with the package.
    .add('file', { type: 'literal', store: fileConfig })

    // Provide default values for settings not provided above.
    .defaults({
        port: 3000,
        max_publishing_topics_counts: 2,
        max_subscription_topics_counts: 20,
        keepAliveInterval: 40
    })

export default nConf
