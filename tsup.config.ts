import { defineConfig } from 'tsup'

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    // Leave @internal members (the hub's core) out of the published typings
    dts: { compilerOptions: { stripInternal: true } },
    clean: true,
    sourcemap: true,
    target: 'node22',
    platform: 'node',
    // Keep `require('nexusse')` returning the class, as in 1.x, while also
    // exposing `.Nexusse`, `.NexusseError` and `.default` for named imports.
    footer: ({ format }) => format === 'cjs'
        ? { js: 'module.exports = Object.assign(module.exports.default, module.exports);' }
        : {}
})
