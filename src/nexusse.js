const Express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const events = require('events')
const NexusseError = require('./NexusseError')
const Subscriber = require('./Subscriber')
const Subscribers = require('./Subscribers')
const defaultConfig = require('./config')
const appName = 'Nexusse'

// Mandatory headers and http status to keep connection open
const httpResponseHeaders = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
}

class NexusseCore {
    constructor(config = null) {
        this.config = defaultConfig

        if (config && (typeof config !== 'number')) {
            if (config.constructor === ({}).constructor) {
                for (const property in config) {
                    // noinspection JSUnfilteredForInLoop
                    this.set(property, config[property])
                }
            }
        }

        // Main app
        this.app = Express()

        // Create an object of EventEmitter class from events module
        this.eventEmitter = new events.EventEmitter()

        // Object for managing the list of subscribers
        this.subscribers = new Subscribers(this.config)

        // Set cors and bodyParser middleware
        this.app.use(cors())
        this.app.use(bodyParser.json())
        this.app.use(bodyParser.urlencoded({ extended: false }))

        // Define endpoints
        this.app.post('/publish', bodyParser.json(), this.publish.bind(this))
        this.app.get('/subscribe', this.subscriptionHandler.bind(this))
        this.app.get('/status', ((req, res) => res.json(this.subscribers.status())))

        this.startKeepAliveTimer()
    }

    get(option) {
        switch (option) {
            default:
                return this.config.get(option)
        }
    }

    set(option, value) {
        switch (option) {
            case 'keepAliveInterval':
                if (typeof value !== "number") {
                    return
                }

                let intValue = parseInt(value)

                if (!intValue || intValue < 5) {
                    return
                }

                this.config.set(option, intValue)

                // Only restart the timer if it is already running (e.g. not during construction)
                if (this.keepAliveTimer) {
                    this
                        .stopKeepAliveTimer()
                        .startKeepAliveTimer()
                }
                break

            default:
                this.config.set(option, value)
        }

        return this
    }

    startKeepAliveTimer() {
        // Never run two timers at once
        this.stopKeepAliveTimer()

        const seconds = parseInt(this.get('keepAliveInterval'))

        if (!Number.isInteger(seconds) || seconds < 1) {
            throw new Error(`Invalid keepAliveInterval "${this.get('keepAliveInterval')}": expected a positive number of seconds`)
        }

        // Try to keep the subscribers connected
        this.keepAliveTimer = setInterval(() => {
            this.eventEmitter.emit('keep-alive')
        }, seconds * 1000)

        // Do not keep the process alive just for the keep-alive pings
        this.keepAliveTimer.unref()

        return this
    }

    stopKeepAliveTimer() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer)
            this.keepAliveTimer = null
        }

        return this
    }

    /**
     * Normalizes the `topics` query parameter. Express gives a string for
     * `?topics=a`, an array for `?topics=a&topics=b` and undefined when absent.
     *
     * @return {string[]}
     */
    static normalizeTopics(rawTopics) {
        const list = Array.isArray(rawTopics) ? rawTopics : (rawTopics === undefined ? [] : [rawTopics])

        return [...new Set(list
            .filter(topic => typeof topic === 'string')
            .map(topic => topic.trim())
            .filter(topic => topic.length > 0))]
    }

    subscriptionHandler(req, res) {
        const topics = NexusseCore.normalizeTopics(req.query.topics)

        if (!topics.length) {
            return res.status(400).json({ error: 'At least one topic is required' })
        }

        let subscriberId = (new Date()).getTime().toString() + Math.random() * 1000000000
        let subscriber

        try {
            subscriber = new Subscriber(this.config, subscriberId, res, topics)
        } catch (error) {
            if (error instanceof NexusseError) {
                return res.status(error.code).json({ error: error.message })
            }
            throw error
        }

        // Write the response header to keep the connection open
        res.writeHead(200, httpResponseHeaders)

        // Create a new client object to be added to the clients map.
        this.subscribers.add(subscriber)

        const keepAliveListener = () => {
            subscriber.keepAlive()
        }

        req.on('close', () => {
            this.subscribers.remove(subscriber)
            this.eventEmitter.off('keep-alive', keepAliveListener)
        })

        this.eventEmitter.on('keep-alive', keepAliveListener)

        res.write(`data:connected\n\n`)

    }

    // Middleware for PORT /publish endpoint
    async publish(req, res) {
        const publishPayload = req.body
        console.log(req.body)

        try {
            this.subscribers.notify(publishPayload)
        } catch (nexusseError) {
            console.error(`${nexusseError.message} (code: ${nexusseError.code}). The notification was not sent.`)
            res.writeHead(nexusseError.code || 500, (nexusseError.code && nexusseError.message) || undefined)
            res.end()
            return
        }

        res.writeHead(200)
        res.end()
    }

    /**
     * Starts listening for connections.
     *
     * @param {number|null} port Port to listen on. Defaults to the configured port. Use 0 for a random free port.
     * @param {function|null} callback Called once the server is actually listening.
     * @return {import('http').Server}
     */
    listen(port = null, callback = null) {
        let _port = (port === null || port === undefined) ? this.get('port') : port
        let onListening = typeof callback === 'function'
            ? callback
            : () => console.log(`${appName} server listening on port ${this.server.address().port}`)

        // If the user has chosen a port at the time of listening
        // for connections, then override the configuration port
        // in the configuration object.
        this.set('port', _port)

        this.server = this.app.listen(_port, onListening)

        return this.server
    }

    /**
     * Stops the keep-alive timer and closes the server and all open connections.
     *
     * @return {Promise<void>}
     */
    close() {
        this.stopKeepAliveTimer()
        this.eventEmitter.removeAllListeners('keep-alive')

        if (!this.server) {
            return Promise.resolve()
        }

        return new Promise((resolve, reject) => {
            this.server.close(error => error ? reject(error) : resolve())

            // SSE connections never end on their own
            if (typeof this.server.closeAllConnections === 'function') {
                this.server.closeAllConnections()
            }
        })
    }
}

class NexusssApi {
    constructor(config = null) {
        // Each API instance owns its own core, so several hubs can coexist (e.g. in tests)
        this.core = new NexusseCore(config)
    }

    // noinspection JSUnusedGlobalSymbols
    startKeepAliveTimer() {
        return this.core.startKeepAliveTimer()
    }

    // noinspection JSUnusedGlobalSymbols
    stopKeepAliveTimer() {
        return this.core.stopKeepAliveTimer()
    }

    get(option) {
        return this.core.get(option)
    }

    // noinspection JSUnusedGlobalSymbols
    set(option, value) {
        return this.core.set(option, value)
    }

    listen(port = null, callback = null) {
        return this.core.listen(port, callback)
    }

    // noinspection JSUnusedGlobalSymbols
    close() {
        return this.core.close()
    }
}

module.exports = NexusssApi
