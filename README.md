
As simple Server-Sent Event hub based on Express.

  [![NPM Version][npm-image]][npm-url]
  [![NPM Downloads][downloads-image]][downloads-url]
  [![Linux Build][travis-image]][travis-url]
  [![Windows Build][appveyor-image]][appveyor-url]
  [![Test Coverage][coveralls-image]][coveralls-url]
  
```js
const Nexusse = require('nexusse')
const nexusse = new Nexusse()

nexusse.listen();
```

## Installation

This is a Node.js module available through the npm registry.

Before installing, download and install Node.js. Node.js 0.10 or higher is required.

The installation is done using the npm install command:

`npm install nexusse`

## Features

 - ...
 - ...
 
## Documentation

### Configuration

The configuration looks like the following:

```js
{
    "port": 3000,
    "keepAliveInterval": 40
}
```

You can pass a configuration as a literal object to the constructor.

```js
const Nexusse = require('nexusse')

const nexusse = new Nexusse({
    port: 3030
})
```

#### Port

_Default: 3000_

The port can be set in the configuration file or passed to the `listen()` method.

#### keepAliveInterval

_Default: 40_
_Valid values: 5 and up_

You cannot set the keep-alive timer interval to less than 5 seconds. 

## API

### Methods

#### listen(port, options)
Starts listening on the configured port, or the default port. The first two arguments of this method are directly passed to the [Express.js library's listen() method](https://expressjs.com/en/4x/api.html#app.listen).


##### port
- A valid port number _(e.g.: 3020)_: the provided port number will be used.
- null: The configured port or the default port 3000 will be used.

##### options
This parameter is directly passed to the Express' `listen()` method.

#### get(option)
Read a configuration option.

#### set(option, value)
Set a configuration option to the specified value.

#### startKeepAliveTimer()
Start the keep-alive timer. This timer starts automatically when Nexusse starts listening to connections.

You only need to call this method if you had stopped the timer for whatever reason.

Setting a valid `keepAliveInterval` configuration option will automatically stop then start the keep-alive time.

#### stopKeepAliveTimer()
Stop the keep-alive timer.

### Events

None

## Roadmap:
 - Keep the documentation updated
 - Add authentication
 - Server stats HTML endpoints (SSE endpoint, HTML endpoint, REST endpoint)
 - Authentication and access control for publish and subscribers
 - Add proper CORS support
 - Multiple endpoints with their own CORS settings
 - Create a docker image
 - etc.
