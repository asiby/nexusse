import { EventEmitter } from 'node:events'
import type { Server } from 'node:http'
import Express, { type Express as ExpressApp, type Request, type Response } from 'express'
import cors from 'cors'
import NexusseError from './NexusseError'
import Subscriber from './Subscriber'
import Subscribers from './Subscribers'
import defaultConfig, { type Config } from './config'

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
    config: Config
    app: ExpressApp
    eventEmitter: EventEmitter
    subscribers: Subscribers
    keepAliveTimer: NodeJS.Timeout | null = null
    server?: Server

    constructor(config: Record<string, unknown> | null = null) {
        this.config = defaultConfig

        if (config && typeof config === 'object' && config.constructor === Object) {
            for (const property in config) {
                this.set(property, config[property])
            }
        }

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

    get(option: string): any {
        return this.config.get(option)
    }

    set(option: string, value: unknown): this {
        switch (option) {
            case 'keepAliveInterval': {
                if (typeof value !== 'number') {
                    return this
                }

                const intValue = Math.trunc(value)

                if (!intValue || intValue < 5) {
                    return this
                }

                this.config.set(option, intValue)

                // Only restart the timer if it is already running (e.g. not during construction)
                if (this.keepAliveTimer) {
                    this
                        .stopKeepAliveTimer()
                        .startKeepAliveTimer()
                }
                break
            }

            default:
                this.config.set(option, value)
        }

        return this
    }

    startKeepAliveTimer(): this {
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

    stopKeepAliveTimer(): this {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer)
            this.keepAliveTimer = null
        }

        return this
    }

    /**
     * Normalizes the `topics` query parameter. Express gives a string for
     * `?topics=a`, an array for `?topics=a&topics=b` and undefined when absent.
     */
    static normalizeTopics(rawTopics: unknown): string[] {
        const list: unknown[] = Array.isArray(rawTopics) ? rawTopics : (rawTopics === undefined ? [] : [rawTopics])

        return [...new Set(list
            .filter((topic): topic is string => typeof topic === 'string')
            .map(topic => topic.trim())
            .filter(topic => topic.length > 0))]
    }

    subscriptionHandler(req: Request, res: Response): void {
        const topics = NexusseCore.normalizeTopics(req.query.topics)

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
        const publishPayload = req.body
        console.log(req.body)

        try {
            this.subscribers.notify(publishPayload)
        } catch (error) {
            const nexusseError = error as Partial<NexusseError>
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
     * @param port Port to listen on. Defaults to the configured port. Use 0 for a random free port.
     * @param callback Called once the server is actually listening.
     */
    listen(port: number | null = null, callback: ListeningCallback | null = null): Server {
        const _port: number = (port === null || port === undefined) ? this.get('port') : port
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

    constructor(config: Record<string, unknown> | null = null) {
        // Each instance owns its own core, so several hubs can coexist (e.g. in tests)
        this.core = new NexusseCore(config)
    }

    startKeepAliveTimer(): this {
        this.core.startKeepAliveTimer()
        return this
    }

    stopKeepAliveTimer(): this {
        this.core.stopKeepAliveTimer()
        return this
    }

    get(option: string): any {
        return this.core.get(option)
    }

    set(option: string, value: unknown): this {
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
