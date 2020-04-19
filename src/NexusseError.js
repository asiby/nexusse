/**
 * Simple error class
 */
module.exports = class NexusseError {
    constructor(message = "Error", code = 500) {
        this.message = message
        this.code = code
    }
}
