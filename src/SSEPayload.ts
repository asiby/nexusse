import NexusseError from './NexusseError'
import type { Config } from './config'

export interface SSEPayloadOptions {
    id?: string
    event?: string
    data?: unknown
    isComment?: boolean
    retry?: number | null
}

/**
 * A single Server-Sent Event, serialized to the wire format.
 */
export default class SSEPayload {
    config: Config
    id: string
    event: string
    data: unknown
    isComment: boolean
    retry: number | null

    constructor(config: Config, { id = '', event = '', data = '', isComment = false, retry = null }: SSEPayloadOptions) {
        this.config = config
        this.id = id
        this.event = event
        this.data = data
        this.isComment = isComment
        this.retry = retry
    }

    toSseCommentString(): string {
        return `:${this.data || 'comment'}`
    }

    toSsePayloadString(): string {
        let payload = ''

        if (!this.data) {
            throw new NexusseError('The data is required when sending an SSE event', 400)
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

    toString(): string {
        return this.isComment ? this.toSseCommentString() : this.toSsePayloadString()
    }
}
