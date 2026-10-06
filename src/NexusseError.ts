/**
 * Simple error class carrying an HTTP status code.
 */
export default class NexusseError {
    message: string
    code: number

    constructor(message: string = 'Error', code: number = 500) {
        this.message = message
        this.code = code
    }
}
