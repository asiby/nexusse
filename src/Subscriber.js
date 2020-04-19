const NexusseError = require('./NexusseError')

/**
 * Client class
 */
module.exports = class Subscriber {

    constructor(config, id, response, topics) {
        if (!config) {
            throw new Error("Missing configuration for the Subscriber class")
        }

        // noinspection JSUnusedGlobalSymbols
        this.config = config
        this.id = id
        this.response = response
        this.topics = topics

        if (!this.id) {
            throw new NexusseError("The subscriber id is required", 400)
        }

        if (!this.response) {
            throw new NexusseError("Invalid response object passed to a subscription", 400)
        }

        if (this.topics.length > config.get('max_subscription_topics_counts')) {
            throw new NexusseError(`The maximum number of topics (${config.get('max_subscription_topics_counts')}) for a subscription was reached`, 400)
        }
    }

    keepAlive() {
        this.response.write(": Stay alive\n\n")
    }

    toString() {
        return JSON.stringify(this.toJson())
    }

    toJson() {
        return {
            id: this.id,
            data: this.topics
        }
    }
}
