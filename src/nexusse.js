const express = require("express")
const bodyParser = require("body-parser")
const cors = require("cors")
const events = require('events')
const Subscriber = require('./Subscriber')
const Subscribers = require('./Subscribers')
const config = require('./config')

// Port used by the app
const PORT = config.get('port')

// Keep-alive interval in seconds
const KEEP_ALIVE_INTERVAL = config.get('keep_alive_interval')

// Mandatory headers and http status to keep connection open
const httpResponseHeaders = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
}

/**
 * Main application
 */
const app = express()

// Set cors and bodyParser middleware
app.use(cors())
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))

// Create an object of EventEmitter class from events module
const eventEmitter = new events.EventEmitter()

// Object for managing the list of subscribers
let subscribers = new Subscribers(config)

// Define endpoints
// noinspection JSUnresolvedFunction
app.post('/publish', bodyParser.json(), publish)
// noinspection JSUnresolvedFunction
app.get('/subscribe', subscriptionHandler)
// noinspection JSUnresolvedFunction
app.get('/status', (req, res) => res.json(JSON.stringify(subscribers.status())))

// Middleware for GET /subscribe endpoint
function subscriptionHandler(req, res) {
    // Write the response header to keep the connection open
    res.writeHead(200, httpResponseHeaders)

    let subscriberId = (new Date()).getTime().toString() + Math.random() * 1000000000
    let subscriber = new Subscriber(config, subscriberId, res, req.query.topics || [])

    // Create a new client object to be added to the clients map.
    subscribers.add(subscriber)

    const keepAliveListener = () => {
        subscriber.keepAlive()
    }

    req.on('close', () => {
        subscribers.remove(subscriber)
        eventEmitter.off('keep-alive', keepAliveListener)
    })

    eventEmitter.on('keep-alive', keepAliveListener)

    res.write(`data:connected\n\n`)

}

// Middleware for PORT /publish endpoint
async function publish(req, res) {
    const publishPayload = req.body
    console.log(req.body)

    try {
        subscribers.notify(publishPayload)
    } catch (nexusseError) {
        console.error(`${nexusseError.message} (code: ${nexusseError.code}). The notification was not sent.`)
        res.writeHead(nexusseError.code || 500, (nexusseError.code && nexusseError.message) || undefined)
        res.end()
        return
    }

    res.writeHead(200)
    res.end()
}

// Try to keep the subscribers connected
setInterval(() => {
    eventEmitter.emit('keep-alive')
}, KEEP_ALIVE_INTERVAL * 1000)

// Start the server on the specified port
app.listen(PORT, () => console.log(`Nexusse server listening on port ${PORT}`))
