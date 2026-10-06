import type { ServerResponse } from 'node:http'
import NexusseError from './NexusseError'
import type { Options as Config } from './options'

/**
 * A connected client and the topics it listens to.
 */
export default class Subscriber {
    config: Config
    id: string
    response: ServerResponse
    topics: string[]

    constructor(config: Config, id: string, response: ServerResponse, topics: string[]) {
        if (!config) {
            throw new Error('Missing configuration for the Subscriber class')
        }

        this.config = config
        this.id = id
        this.response = response
        this.topics = topics

        if (!this.id) {
            throw new NexusseError('The subscriber id is required', 400)
        }

        if (!this.response) {
            throw new NexusseError('Invalid response object passed to a subscription', 400)
        }

        if (this.topics.length > config.get('maxSubscriptionTopics')) {
            throw new NexusseError(`The maximum number of topics (${config.get('maxSubscriptionTopics')}) for a subscription was reached`, 400)
        }
    }

    keepAlive(): void {
        this.response.write(': Stay alive\n\n')
    }

    toString(): string {
        return JSON.stringify(this.toJson())
    }

    toJson(): { id: string, data: string[] } {
        return {
            id: this.id,
            data: this.topics
        }
    }
}
