const Subscriber = require('./Subscriber')
const NotificationPayload = require('./NotificationPayload')
const SSEPayload = require('./SSEPayload')

/**
 * Class for handling the state of all the subscribers
 */
module.exports = class Subscribers {
    constructor(config) {
        if (!config) {
            throw new Error("Missing configuration for the Subscribers class")
        }

        this.config = config
        this.data = new Map()
    }

    /**
     * @param {Subscriber} subscriber
     */
    add(subscriber) {
        let added = false

        //console.log(subscriber)

        subscriber.topics.forEach((topic) => {
            if (this.data.has(topic)) {
                this.data.get(topic).push(subscriber)
            } else {
                this.data.set(topic, [subscriber])
            }

            added = true
        })

        //console.log(this.data)
        added && this.status()
    }

    /**
     * @param {Subscriber} subscriber
     */
    remove(subscriber) {
        let removed = false

        subscriber.topics.forEach((topic) => {
            if (this.data.has(topic)) {

                // Retrieve the data for the topic, filter out the disconnected subscriber and store it back.
                this.data.set(
                    topic,
                    this.data
                        .get(topic)
                        .filter(savedSubscriber => savedSubscriber.id !== subscriber.id)
                )

                removed = true

            }
        })

        removed && this.status()
    }

    /**
     *
     * @param {object} rawPublishPayload
     */
    notify(rawPublishPayload) {
        let notifiedClients = new Set()
        let payload = new NotificationPayload(this.config, rawPublishPayload)
        let ssePayload = new SSEPayload(this.config, payload.toJson())

        payload.topics.forEach((topic) => {
            if (this.data.has(topic)) {
                /**
                 * @type {array}
                 */
                let topicContent = this.data.get(topic)

                topicContent.forEach((savedSubscriber) => {
                    if (notifiedClients.has(savedSubscriber.id)) {
                        /*
                        Do not sent the same message to a customer more than once
                        if he/she is subscribed not more than one channel that are
                        being targeted by this notification.
                         */
                        return
                    }

                    //savedSubscriber.response.write(`id: <find-a-way-to-uniquely-id-each-event>\n`)
                    savedSubscriber.response.write(`${ssePayload}`)
                    notifiedClients.add(savedSubscriber.id)
                })
            }
        })
    }

    /**
     * Returns the total number of subscriptions or connections
     *
     * @return {number}
     */
    count(subscriptionCount = false) {
        let sum = 0
        let mapIterator = this.data.values()
        let item = mapIterator.next()
        let subscriberIds = new Set()

        while (!item.done) {
            if (Array.isArray(item.value)) {
                if (subscriptionCount) {
                    sum += item.value.length
                } else {
                    item.value.forEach((subscriber) => {
                        subscriberIds.add(subscriber.id)
                    })
                }
            }

            item = mapIterator.next()
        }

        return subscriptionCount ? sum : subscriberIds.size
    }

    /**
     * Returns the total number of topics
     *
     * @return {number}
     */
    topicCount() {
        return this.data.size
    }

    /**
     * Returns the total number of subscribers per topic
     *
     * @return {number}
     */
    topicsSummary() {
        let summary = {}
        let mapIterator = this.data.entries()
        let item = mapIterator.next()

        while (!item.done) {
            if (Array.isArray(item.value) && (item.value.length === 2)) {
                summary[item.value[0]] = (Array.isArray(item.value[1]) && item.value[1].length) || 0
            }

            item = mapIterator.next()
        }

        return summary
    }

    /**
     * Returns the total number of connections
     *
     * @return {number}
     */
    connectionCount() {
        return this.count()
    }

    /**
     * Returns the total number of subscriptions
     *
     * @return {number}
     */
    subscriptionCount() {
        return this.count(true)
    }

    status() {
        return {
            connections: this.connectionCount(),
            subscriptions: this.subscriptionCount(),
            topics: this.topicCount(),
            summary: this.topicsSummary()
        }
    }
}
