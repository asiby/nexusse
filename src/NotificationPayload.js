const NexusseError = require('./NexusseError')

/**
 * Notification payload
 *
 * This represents the message that will be encapsulated inside the Server Sent Events.
 */
module.exports = class NotificationPayload {
    constructor(config, {event:event = '', data: data = null, topics: topics = []}) {
        if (!config) {
            throw new Error("Missing configuration for the NotificationPayload class")
        }

        this.config = config
        this.event = event
        this.data = data
        this.topics = topics

        if (!this.event) {
            throw new NexusseError("The notification payload event is required", 400)
        }

        if (!this.topics.length) {
            throw new NexusseError("The notification payload must have at least one topic", 400)
        }

        if (this.topics.length > this.config.get('max_publishing_topics_counts')) {
            throw new NexusseError(`The notification payload has exceeded the maximum number of ${this.config.get('max_publishing_topics_counts')} topics`, 400)
        }
    }

    toString() {
        return JSON.stringify(this.toJson())
    }

    toJson() {
        return {
            event: this.event,
            data: this.data,
            topics: this.topics
        }
    }
}
