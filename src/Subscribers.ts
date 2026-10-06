import Subscriber from './Subscriber'
import NotificationPayload, { type RawNotification } from './NotificationPayload'
import SSEPayload from './SSEPayload'
import type { Config } from './config'

export interface HubStatus {
    connections: number
    subscriptions: number
    topics: number
    summary: Record<string, number>
}

/**
 * Keeps track of every subscriber, indexed by topic.
 */
export default class Subscribers {
    config: Config
    data: Map<string, Subscriber[]>

    constructor(config: Config) {
        if (!config) {
            throw new Error('Missing configuration for the Subscribers class')
        }

        this.config = config
        this.data = new Map()
    }

    add(subscriber: Subscriber): void {
        subscriber.topics.forEach((topic) => {
            const existing = this.data.get(topic)

            if (existing) {
                existing.push(subscriber)
            } else {
                this.data.set(topic, [subscriber])
            }
        })
    }

    remove(subscriber: Subscriber): void {
        subscriber.topics.forEach((topic) => {
            const existing = this.data.get(topic)

            if (existing) {
                // Filter out the disconnected subscriber and store the list back.
                this.data.set(topic, existing.filter(saved => saved.id !== subscriber.id))
            }
        })
    }

    notify(rawPublishPayload: RawNotification): void {
        const notifiedClients = new Set<string>()
        const payload = new NotificationPayload(this.config, rawPublishPayload)
        const ssePayload = new SSEPayload(this.config, payload.toJson())

        payload.topics.forEach((topic) => {
            this.data.get(topic)?.forEach((savedSubscriber) => {
                // Do not send the same message to a subscriber more than once
                // if they are subscribed to several of the targeted topics.
                if (notifiedClients.has(savedSubscriber.id)) {
                    return
                }

                savedSubscriber.response.write(`${ssePayload}`)
                notifiedClients.add(savedSubscriber.id)
            })
        })
    }

    /**
     * Returns the total number of subscriptions (one per subscriber and topic)
     * or, by default, the number of distinct connections.
     */
    count(subscriptionCount = false): number {
        let sum = 0
        const subscriberIds = new Set<string>()

        for (const subscribers of this.data.values()) {
            if (subscriptionCount) {
                sum += subscribers.length
            } else {
                subscribers.forEach(subscriber => subscriberIds.add(subscriber.id))
            }
        }

        return subscriptionCount ? sum : subscriberIds.size
    }

    /** Total number of topics. */
    topicCount(): number {
        return this.data.size
    }

    /** Number of subscribers per topic. */
    topicsSummary(): Record<string, number> {
        const summary: Record<string, number> = {}

        for (const [topic, subscribers] of this.data) {
            summary[topic] = subscribers.length
        }

        return summary
    }

    /** Total number of connections. */
    connectionCount(): number {
        return this.count()
    }

    /** Total number of subscriptions. */
    subscriptionCount(): number {
        return this.count(true)
    }

    status(): HubStatus {
        return {
            connections: this.connectionCount(),
            subscriptions: this.subscriptionCount(),
            topics: this.topicCount(),
            summary: this.topicsSummary()
        }
    }
}
