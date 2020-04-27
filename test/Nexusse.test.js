const NexusseError = require('../src/NexusseError')

test(`Default error message is "Error"`, () => {
    const nexusseError = new NexusseError()
    expect(nexusseError.message).toBe("Error")
})

test(`Default error code is 500`, () => {
    const nexusseError = new NexusseError()
    expect(nexusseError.code).toBe(500)
})

test(`The error message can be set with optional error code`, () => {
    const nexusseError = new NexusseError("A customer error")
    expect(nexusseError.message).toBe("A customer error")
})

test(`The error code can be set with optional error message`, () => {
    const nexusseError = new NexusseError(null, 123)
    expect(nexusseError.code).toBe(123)
})