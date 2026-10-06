import NexusseError from './NexusseError'
import type { Config } from './config'

export interface RawNotification {
    event?: string
    data?: unknown
    topics?: string[]
}

/**
 * Notification payload
 *
 * This represents the message that will be encapsulated inside the Server Sent Events.
 */
export default class NotificationPayload {
    config: Config
    event: string
    data: unknown
    topics: string[]

    constructor(config: Config, { event = '', data = null, topics = [] }: RawNotification = {}) {
        if (!config) {
            throw new Error('Missing configuration for the NotificationPayload class')
        }

        this.config = config
        this.event = event
        this.data = data
        this.topics = topics

        if (!this.event) {
            throw new NexusseError('The notification payload event is required', 400)
        }

        if (!this.topics.length) {
            throw new NexusseError('The notification payload must have at least one topic', 400)
        }

        if (this.topics.length > this.config.get('max_publishing_topics_counts')) {
            throw new NexusseError(`The notification payload has exceeded the maximum number of ${this.config.get('max_publishing_topics_counts')} topics`, 400)
        }
    }

    toString(): string {
        return JSON.stringify(this.toJson())
    }

    toJson(): Required<RawNotification> {
        return {
            event: this.event,
            data: this.data,
            topics: this.topics
        }
    }
}
