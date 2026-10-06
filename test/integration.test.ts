/**
 * Integration tests: start a real Nexusse server on a random port
 * and talk to it over HTTP, the way clients do.
 */
import http from 'node:http'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import Nexusse from '../src/index'

let hub: Nexusse
let port: number

interface Subscription {
    res: http.IncomingMessage
    req: http.ClientRequest
    chunks: string
}

interface HttpResult {
    status: number | undefined
    headers: http.IncomingHttpHeaders
    body: string
}

/**
 * Opens an SSE subscription and collects everything the server writes.
 * Resolves once the response headers arrive.
 */
function subscribe(query: string): Promise<Subscription> {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}/subscribe${query}`, (res) => {
            const sub: Subscription = { res, req, chunks: '' }
            res.setEncoding('utf8')
            res.on('data', chunk => { sub.chunks += chunk })
            res.on('error', () => {})
            resolve(sub)
        })
        req.on('error', reject)
    })
}

function request(method: string, path: string, body?: unknown): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? undefined : JSON.stringify(body)
        const req = http.request({
            hostname: 'localhost',
            port,
            path,
            method,
            headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}
        }, (res) => {
            let data = ''
            res.setEncoding('utf8')
            res.on('data', chunk => { data += chunk })
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }))
        })
        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
    })
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Waits until `predicate()` is true or the timeout expires. */
async function waitFor(predicate: () => boolean, timeout = 1000) {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for condition')
        await wait(10)
    }
}

beforeEach(async () => {
    hub = new Nexusse()
    await new Promise<void>((resolve) => {
        const server = hub.listen(0, () => {
            port = (server.address() as AddressInfo).port
            resolve()
        })
    })
})

afterEach(async () => {
    await hub.close()
})

describe('listen()', () => {
    test('returns the http server and invokes the callback only once listening', async () => {
        const other = new Nexusse()
        let returned = false
        let server!: http.Server
        await new Promise<void>((resolve) => {
            server = other.listen(0, () => {
                // Previously the callback was invoked synchronously, before the server was bound
                expect(returned).toBe(true)
                expect(server.listening).toBe(true)
                expect((server.address() as AddressInfo).port).toBeGreaterThan(0)
                resolve()
            })
            returned = true
        })
        expect(server).toBeInstanceOf(http.Server)
        await other.close()
    })

    test('does not report success when the port is already taken', async () => {
        const other = new Nexusse()
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const server = other.listen(port)

        const error = await new Promise<NodeJS.ErrnoException>(resolve => server.on('error', resolve))
        expect(error.code).toBe('EADDRINUSE')
        expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('listening'))
        logSpy.mockRestore()
        await other.close().catch(() => {})
    })
})

describe('options', () => {
    test('defaults', () => {
        const other = new Nexusse()
        expect(other.get('port')).toBe(3000)
        expect(other.get('keepAliveInterval')).toBe(40)
        expect(other.get('maxPublishingTopics')).toBe(2)
        expect(other.get('maxSubscriptionTopics')).toBe(20)
    })

    test('are passed to the constructor and kept per hub', async () => {
        const other = new Nexusse({ keepAliveInterval: 10, maxSubscriptionTopics: 1 })
        expect(other.get('keepAliveInterval')).toBe(10)
        expect(hub.get('keepAliveInterval')).toBe(40)

        other.set('port', 4321)
        expect(hub.get('port')).not.toBe(4321)
        await other.close()
    })

    test('reject invalid values and unknown names', () => {
        expect(() => new Nexusse({ keepAliveInterval: 2 })).toThrow(RangeError)
        expect(() => new Nexusse({ port: 70000 })).toThrow(RangeError)
        expect(() => new Nexusse({ nope: 1 } as never)).toThrow(TypeError)
        expect(() => hub.set('maxPublishingTopics', 0)).toThrow(RangeError)
    })

    test('maxSubscriptionTopics limits subscriptions', async () => {
        hub.set('maxSubscriptionTopics', 1)
        const res = await request('GET', '/subscribe?topics=a&topics=b')
        expect(res.status).toBe(400)
    })
})

describe('keep-alive', () => {
    test('uses the configured interval in seconds', () => {
        expect(hub.get('keepAliveInterval')).toBe(40)
    })

    test('does not fire continuously', async () => {
        let emitted = 0
        hub.core.eventEmitter.on('keep-alive', () => emitted++)

        const sub = await subscribe('?topics=a&topics=b')
        await wait(500)

        expect(emitted).toBe(0)
        expect(sub.chunks).not.toContain('Stay alive')
        sub.req.destroy()
    })

    test('changing the interval keeps a single timer running', () => {
        const before = hub.core.keepAliveTimer
        hub.set('keepAliveInterval', 10)

        expect(hub.get('keepAliveInterval')).toBe(10)
        expect(hub.core.keepAliveTimer).not.toBe(before)
        expect((before as unknown as { _destroyed: boolean })._destroyed).toBe(true)
    })

    test('rejects intervals below 5 seconds', () => {
        expect(() => hub.set('keepAliveInterval', 1)).toThrow(RangeError)
        expect(hub.get('keepAliveInterval')).toBe(40)
    })
})

describe('GET /subscribe', () => {
    test('accepts a single topic without crashing', async () => {
        const sub = await subscribe('?topics=news')

        expect(sub.res.statusCode).toBe(200)
        expect(sub.res.headers['content-type']).toMatch(/text\/event-stream/)
        await waitFor(() => sub.chunks.includes('data:connected'))

        const status = JSON.parse((await request('GET', '/status')).body)
        expect(status.summary).toEqual({ news: 1 })
        sub.req.destroy()
    })

    test('accepts several topics', async () => {
        const sub = await subscribe('?topics=a&topics=b')
        expect(sub.res.statusCode).toBe(200)

        const status = JSON.parse((await request('GET', '/status')).body)
        expect(status).toMatchObject({ connections: 1, subscriptions: 2, topics: 2 })
        sub.req.destroy()
    })

    test('returns 400 when no topic is given', async () => {
        const res = await request('GET', '/subscribe')
        expect(res.status).toBe(400)
        expect(JSON.parse(res.body).error).toMatch(/topic/)
    })

    test('returns 400 when too many topics are given', async () => {
        const query = '?' + Array.from({ length: 21 }, (_, i) => `topics=t${i}`).join('&')
        const res = await request('GET', `/subscribe${query}`)
        expect(res.status).toBe(400)
    })

    test('removes the subscriber when the client disconnects', async () => {
        const sub = await subscribe('?topics=news')
        sub.req.destroy()

        await waitFor(() => hub.core.subscribers.connectionCount() === 0)
    })

    test('drops topics from /status once their last subscriber leaves', async () => {
        const first = await subscribe('?topics=news&topics=sports')
        const second = await subscribe('?topics=news')

        first.req.destroy()
        await waitFor(() => hub.core.subscribers.connectionCount() === 1)

        let status = JSON.parse((await request('GET', '/status')).body)
        expect(status).toEqual({ connections: 1, subscriptions: 1, topics: 1, summary: { news: 1 } })

        second.req.destroy()
        await waitFor(() => hub.core.subscribers.connectionCount() === 0)

        status = JSON.parse((await request('GET', '/status')).body)
        expect(status).toEqual({ connections: 0, subscriptions: 0, topics: 0, summary: {} })
    })
})

describe('GET /status', () => {
    test('returns a JSON object, not a JSON-encoded string', async () => {
        const res = await request('GET', '/status')

        expect(res.status).toBe(200)
        expect(res.headers['content-type']).toMatch(/application\/json/)

        const body = JSON.parse(res.body)
        expect(typeof body).toBe('object')
        expect(body).toEqual({ connections: 0, subscriptions: 0, topics: 0, summary: {} })
    })
})

describe('POST /publish', () => {
    test('delivers an event to subscribers of the topic, once per subscriber', async () => {
        const sub = await subscribe('?topics=a&topics=b')
        const other = await subscribe('?topics=c')

        const res = await request('POST', '/publish', { event: 'greeting', data: { hello: 'world' }, topics: ['a', 'b'] })
        expect(res.status).toBe(200)

        await waitFor(() => sub.chunks.includes('event: greeting'))
        expect(sub.chunks.match(/event: greeting/g)).toHaveLength(1)
        expect(sub.chunks).toContain(`data: ${JSON.stringify({ hello: 'world' })}`)
        expect(other.chunks).not.toContain('event: greeting')

        sub.req.destroy()
        other.req.destroy()
    })

    test('accepts a single topic as a string', async () => {
        const sub = await subscribe('?topics=news')

        const res = await request('POST', '/publish', { event: 'headline', data: 'hi', topics: 'news' })
        expect(res.status).toBe(200)
        expect(JSON.parse(res.body)).toEqual({ ok: true })

        await waitFor(() => sub.chunks.includes('event: headline'))
        sub.req.destroy()
    })

    test('returns 400 with a JSON error for an invalid payload', async () => {
        const res = await request('POST', '/publish', { data: 'no event or topics' })
        expect(res.status).toBe(400)
        expect(JSON.parse(res.body).error).toMatch(/event/)
    })

    test('returns 400 when targeting too many topics', async () => {
        const res = await request('POST', '/publish', { event: 'e', data: 'd', topics: ['a', 'b', 'c'] })
        expect(res.status).toBe(400)
        expect(JSON.parse(res.body).error).toMatch(/maximum/)
    })

    test('returns 400 when the body is not a JSON object', async () => {
        const res = await request('POST', '/publish', ['not', 'an', 'object'])
        expect(res.status).toBe(400)
    })
})
