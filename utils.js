const stun = require('stun')
const getports = require('getports')

module.exports.stunRequest = socket => {
  return new Promise((resolve, reject) => {
    stun.request('stun.l.google.com:19302', { socket }, (err, response) => {
      if (err) {
        return reject(err)
      }
      resolve(response.getXorAddress())
    })
  })
}

module.exports.getOpenPorts = (count = 1, start = 10000) => {
  return new Promise((resolve, reject) => {
    getports(count, { start }, (error, ports) => {
      if (error) {
        return reject(error)
      }
      resolve(ports)
    })
  })
}
