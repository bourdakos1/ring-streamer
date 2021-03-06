const process = require('process')
const { createSocket } = require('dgram')

const H264Builder = require('./H264Builder')
const getSipOptions = require('./getSipOptions')
const { getOpenPorts, stunRequest } = require('./utils')

const { SipSession } = require('ring-client-api')

const CAMERA_TO_STREAM = 'Backyard'

stunRequest().then(async stun => {
  const [localRingAudioPort, localRingVideoPort] = await getOpenPorts(2, 10000)

  const sipOptions = await getSipOptions(CAMERA_TO_STREAM)
  const localRtpOptions = {
    address: stun.address,
    audio: {
      port: localRingAudioPort,
      srtpKey: null,
      srtpSalt: null
    },
    video: {
      port: localRingVideoPort,
      srtpKey: null,
      srtpSalt: null
    }
  }

  const sipSession = new SipSession(sipOptions, localRtpOptions)

  const ringVideoSocket = createSocket('udp4')

  const h264Builder = new H264Builder('output.h264')
  let packets = 0
  ringVideoSocket.on('message', message => {
    packets = packets + 1
    process.stdout.write('\x1b[0G\x1b[K')
    process.stdout.write(`Packets received: ${packets}`)
    h264Builder.packetReceived(message)
  })

  ringVideoSocket.bind(localRingVideoPort)

  const rtpOptions = await sipSession.getRemoteRtpOptions()

  ringVideoSocket.send('\r\n', rtpOptions.video.port, rtpOptions.address)
})
