import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import Express, { type Express as ExpressApp, type Request, type Response } from 'express'
import cors from 'cors'
import NexusseError from './NexusseError'
import { normalizeTopics } from './topics'
import Subscriber from './Subscriber'
import Subscribers from './Subscribers'
import { Options, type NexusseOptions } from './options'

const appName = 'Nexusse'

// Mandatory headers and http status to keep connection open
const httpResponseHeaders = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
}

export type ListeningCallback = () => void

/** @internal */
export class NexusseCore {
    config: Options
    app: ExpressApp
    eventEmitter: EventEmitter
    subscribers: Subscribers
    keepAliveTimer: NodeJS.Timeout | null = null
    server?: Server

    constructor(options: Partial<NexusseOptions> = {}) {
        // Each hub has its own options; nothing is shared between instances
        this.config = new Options(options)

        // Main app
        this.app = Express()

        // Emits 'keep-alive' on every keep-alive tick
        this.eventEmitter = new EventEmitter()

        // Object for managing the list of subscribers
        this.subscribers = new Subscribers(this.config)

        // Set cors and body parsing middleware
        this.app.use(cors())
        this.app.use(Express.json())
        this.app.use(Express.urlencoded({ extended: false }))

        // Define endpoints
        this.app.post('/publish', this.publish.bind(this))
        this.app.get('/subscribe', this.subscriptionHandler.bind(this))
        this.app.get('/status', (_req, res) => { res.json(this.subscribers.status()) })

        this.startKeepAliveTimer()
    }

    get<K extends keyof NexusseOptions>(option: K): NexusseOptions[K] {
        return this.config.get(option)
    }

    set<K extends keyof NexusseOptions>(option: K, value: NexusseOptions[K]): this {
        this.config.set(option, value)

        // Apply a new interval right away if the timer is already running
        if (option === 'keepAliveInterval' && this.keepAliveTimer) {
            this.startKeepAliveTimer()
        }

        return this
    }

    startKeepAliveTimer(): this {
        // Never run two timers at once
        this.stopKeepAliveTimer()

        // Validated by Options: always an integer of at least 5
        const seconds = this.get('keepAliveInterval')

        // Try to keep the subscribers connected
        this.keepAliveTimer = setInterval(() => {
            this.eventEmitter.emit('keep-alive')
        }, seconds * 1000)

        // Do not keep the process alive just for the keep-alive pings
        this.keepAliveTimer.unref()

        return this
    }

    stopKeepAliveTimer(): this {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer)
            this.keepAliveTimer = null
        }

        return this
    }

    subscriptionHandler(req: Request, res: Response): void {
        const topics = normalizeTopics(req.query.topics)

        if (!topics.length) {
            res.status(400).json({ error: 'At least one topic is required' })
            return
        }

        const subscriberId = (new Date()).getTime().toString() + Math.random() * 1000000000
        let subscriber: Subscriber

        try {
            subscriber = new Subscriber(this.config, subscriberId, res, topics)
        } catch (error) {
            if (error instanceof NexusseError) {
                res.status(error.code).json({ error: error.message })
                return
            }
            throw error
        }

        // Write the response header to keep the connection open
        res.writeHead(200, httpResponseHeaders)

        this.subscribers.add(subscriber)

        const keepAliveListener = () => {
            subscriber.keepAlive()
        }

        req.on('close', () => {
            this.subscribers.remove(subscriber)
            this.eventEmitter.off('keep-alive', keepAliveListener)
        })

        this.eventEmitter.on('keep-alive', keepAliveListener)

        res.write('data:connected\n\n')
    }

    // Handler for the POST /publish endpoint
    publish(req: Request, res: Response): void {
        const body = req.body

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            res.status(400).json({ error: 'The request body must be a JSON object' })
            return
        }

        try {
            this.subscribers.notify(body)
        } catch (error) {
            if (error instanceof NexusseError) {
                res.status(error.code).json({ error: error.message })
                return
            }

            console.error('Nexusse: failed to publish a notification', error)
            res.status(500).json({ error: 'Internal error: the notification was not sent' })
            return
        }

        res.status(200).json({ ok: true })
    }

    /**
     * Starts listening for connections.
     *
     * @param port Port to listen on. Defaults to the configured port. Use 0 for a random free port.
     * @param callback Called once the server is actually listening.
     */
    listen(port: number | null = null, callback: ListeningCallback | null = null): Server {
        const _port = (port === null || port === undefined) ? this.get('port') : port
        const onListening = typeof callback === 'function'
            ? callback
            : () => {
                const address = this.server?.address()
                console.log(`${appName} server listening on port ${typeof address === 'object' && address ? address.port : _port}`)
            }

        // If the user has chosen a port at the time of listening
        // for connections, then override the configuration port
        // in the configuration object.
        this.set('port', _port)

        // Express 5 also invokes the app.listen() callback on errors,
        // so only call ours once the server is actually listening.
        const server = this.app.listen(_port)
        server.once('listening', onListening)
        this.server = server

        return server
    }

    /**
     * Stops the keep-alive timer and closes the server and all open connections.
     */
    close(): Promise<void> {
        this.stopKeepAliveTimer()
        this.eventEmitter.removeAllListeners('keep-alive')

        const server = this.server

        if (!server) {
            return Promise.resolve()
        }

        return new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve())

            // SSE connections never end on their own
            server.closeAllConnections()
        })
    }
}

/**
 * Public API of a Nexusse hub.
 */
export class Nexusse {
    /** @internal */
    readonly core: NexusseCore

    constructor(options: Partial<NexusseOptions> = {}) {
        this.core = new NexusseCore(options)
    }

    startKeepAliveTimer(): this {
        this.core.startKeepAliveTimer()
        return this
    }

    stopKeepAliveTimer(): this {
        this.core.stopKeepAliveTimer()
        return this
    }

    /** Reads an option. */
    get<K extends keyof NexusseOptions>(option: K): NexusseOptions[K] {
        return this.core.get(option)
    }

    /** Changes an option. Throws a RangeError for invalid values. */
    set<K extends keyof NexusseOptions>(option: K, value: NexusseOptions[K]): this {
        this.core.set(option, value)
        return this
    }

    listen(port: number | null = null, callback: ListeningCallback | null = null): Server {
        return this.core.listen(port, callback)
    }

    close(): Promise<void> {
        return this.core.close()
    }
}

export default Nexusse
