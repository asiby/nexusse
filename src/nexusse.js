const Express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const events = require('events')
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

let nexusse = undefined

function createNexusse(config = null) {
    nexusse = new NexusseCore(config)
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
        // noinspection JSUnresolvedFunction
        this.app.post('/publish', bodyParser.json(), this.publish.bind(this))
        // noinspection JSUnresolvedFunction
        this.app.get('/subscribe', this.subscriptionHandler.bind(this))
        // noinspection JSUnresolvedFunction
        this.app.get('/status', ((req, res) => res.json(JSON.stringify(this.subscribers.status()))).bind(this))

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
            default:
                this.config.set(option, value)
        }
    }

    startKeepAliveTimer() {
        // Try to keep the subscribers connected
        this.keepAliveTimer = setInterval(() => {
            this.eventEmitter.emit('keep-alive')
        }, this.get('keep_alive_interval') * 1000)
    }

    // noinspection JSUnusedGlobalSymbols
    stopKeepAliveTimer() {
        // Try to keep the subscribers connected
        clearInterval(this.keepAliveTimer)
    }

    // Middleware for GET /subscribe endpoint
    subscriptionHandler(req, res) {
        // Write the response header to keep the connection open
        res.writeHead(200, httpResponseHeaders)
        console.log(this.config)
        let subscriberId = (new Date()).getTime().toString() + Math.random() * 1000000000
        let subscriber = new Subscriber(this.config, subscriberId, res, req.query.topics || [])

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

    // noinspection JSUnusedGlobalSymbols
    listen(port = null, options = null) {
        let defaultOptions = () => console.log(`${appName} server listening on port ${this.get('port')}`)
        let _port = port || this.get('port')

        // If the user has chosen a port at the time of listening
        // for connections, then override the configuration port
        // in the configuration object.
        this.set('port', _port)

        this.app.listen(_port, options || defaultOptions())
    }
}

class NexusssApi {
    constructor(config = null) {
        createNexusse(config)
    }

    // noinspection JSUnusedGlobalSymbols
    startKeepAliveTimer() {
        return nexusse.startKeepAliveTimer()
    }

    // noinspection JSUnusedGlobalSymbols
    stopKeepAliveTimer() {
        return nexusse.stopKeepAliveTimer()
    }

    get(option) {
        return nexusse.get(option)
    }

    // noinspection JSUnusedGlobalSymbols
    set(option, value) {
        return nexusse.set(option, value)
    }

    listen(port = null, options = null) {
        nexusse.listen(port, options)
    }
}

module.exports = NexusssApi
