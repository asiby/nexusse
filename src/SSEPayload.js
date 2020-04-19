const NexusseError = require('./NexusseError')

/**
 * Notification payload
 *
 * This represents the message that will be encapsulated inside the Server Sent Events.
 */
module.exports = class SSEPayload {
    constructor(config, {
        id:id = '',
        event:event = '',
        data:data = '',
        isComment:isComment = false,
        retry:retry = null
    }) {
        this.config = config
        this.id = id
        this.event = event
        this.data = data
        this.isComment = isComment
        this.retry = retry

        // savedSubscriber.response.write(`event: ${payload.type}\n`)
        // savedSubscriber.response.write(`data: ${payload.message}\n\n`)

    }

    toSseCommentString() {
        return `:${this.data || "comment"}`
    }

    toSsePayloadString() {
        let payload = ''

        if (!this.data) {
            throw new NexusseError("The data is required when sending an SSE event", 400)
        }

        if (this.id) {
            payload += `id: ${this.id}\n`
        }

        if (this.event) {
            payload += `event: ${this.event}\n`
        }

        if (this.retry) {
            payload += `retry: ${this.retry}\n`
        }

        payload += `data: ${JSON.stringify(this.data)}\n\n`

        return payload
    }

    toString() {
        if (this.isComment) {
            return this.toSseCommentString()
        } else {
            return this.toSsePayloadString()
        }
    }
}
