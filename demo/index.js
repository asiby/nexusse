const Nexusse = require('nexusse')

const nexusse = new Nexusse()

nexusse.listen(null, () => {
    console.log(`The Nexusse demo is now running and listening on port ${nexusse.get('port')}`)
});
