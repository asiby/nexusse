/**
 * Settings for a Nexusse hub.
 */
export interface NexusseOptions {
    /** Port used by listen() when none is given. 0 picks a random free port. Default: 3000 */
    port: number
    /** Seconds between keep-alive comments sent to subscribers. Minimum 5. Default: 40 */
    keepAliveInterval: number
    /** Maximum number of topics a single publish can target. Default: 2 */
    maxPublishingTopics: number
    /** Maximum number of topics a single subscription can listen to. Default: 20 */
    maxSubscriptionTopics: number
}

export const defaultOptions: Readonly<NexusseOptions> = Object.freeze({
    port: 3000,
    keepAliveInterval: 40,
    maxPublishingTopics: 2,
    maxSubscriptionTopics: 20
})

type Validator = (value: number) => boolean

const validators: Record<keyof NexusseOptions, [Validator, string]> = {
    port: [v => Number.isInteger(v) && v >= 0 && v <= 65535, 'an integer between 0 and 65535'],
    keepAliveInterval: [v => Number.isInteger(v) && v >= 5, 'an integer of at least 5 (seconds)'],
    maxPublishingTopics: [v => Number.isInteger(v) && v >= 1, 'a positive integer'],
    maxSubscriptionTopics: [v => Number.isInteger(v) && v >= 1, 'a positive integer']
}

function isOptionName(name: string): name is keyof NexusseOptions {
    return Object.prototype.hasOwnProperty.call(validators, name)
}

/**
 * Validated, per-hub options.
 */
export class Options {
    private readonly values: NexusseOptions

    constructor(overrides: Partial<NexusseOptions> = {}) {
        this.values = { ...defaultOptions }

        if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
            throw new TypeError('Nexusse options must be an object')
        }

        for (const [name, value] of Object.entries(overrides)) {
            if (value !== undefined) {
                this.set(name as keyof NexusseOptions, value as number)
            }
        }
    }

    get<K extends keyof NexusseOptions>(name: K): NexusseOptions[K] {
        return this.values[name]
    }

    set<K extends keyof NexusseOptions>(name: K, value: NexusseOptions[K]): void {
        if (!isOptionName(name)) {
            throw new TypeError(`Unknown Nexusse option "${String(name)}"`)
        }

        const [isValid, expected] = validators[name]

        if (typeof value !== 'number' || !isValid(value)) {
            throw new RangeError(`Invalid value ${JSON.stringify(value)} for option "${name}": expected ${expected}`)
        }

        this.values[name] = value
    }

    toJSON(): NexusseOptions {
        return { ...this.values }
    }
}
