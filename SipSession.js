const ip = require('ip')
const sip = require('sip')
const sdp = require('sdp')

const getRandomId = () => {
  return Math.floor(Math.random() * 1e6).toString()
}

const getRtpDescription = (sections, mediaType) => {
  const section = sections.find(s => s.startsWith('m=' + mediaType)),
    { port } = sdp.parseMLine(section),
    lines = sdp.splitLines(section),
    cryptoLine = lines.find(l => l.startsWith('a=crypto'))

  if (!cryptoLine) {
    return { port }
  }
  const encodedCrypto = cryptoLine.match(/inline:(\S*)/)[1],
    crypto = Buffer.from(encodedCrypto, 'base64')

  return {
    port,
    srtpKey: crypto.slice(0, 16),
    srtpSalt: crypto.slice(16, 30)
  }
}

module.exports = class SipSession {
  constructor(sipOptions, rtpOptions) {
    this.dialogs = {}
    this.cbs = {}
    this.seq = 20
    this.stopped = false
    this.sipOptions = sipOptions
    this.rtpOptions = rtpOptions
    const { to, from, dingId } = this.sipOptions

    this.defaultHeaders = {
      to: {
        name: '"FS Doorbot"',
        uri: to,
        params: {}
      },
      from: {
        uri: from,
        params: { tag: getRandomId() }
      },
      'max-forwards': 70,
      'call-id': getRandomId(),
      'X-Ding': dingId,
      'X-Authorization': '',
      'User-Agent': 'Android/3.15.3 (belle-sip/1.4.2)'
    }
  }

  sipRequest({ method, headers, contentLines }) {
    const { to } = this.sipOptions

    const seq = this.seq++
    const newHeaders = {
      ...this.defaultHeaders,
      cseq: { seq: seq, method: method },
      ...headers
    }

    return new Promise((resolve, reject) => {
      sip.send(
        {
          method,
          uri: to,
          headers: newHeaders,
          content: contentLines
            ? contentLines
                .filter(l => l)
                .map(line => line + '\r\n')
                .join('')
            : undefined
        },
        response => {
          if (!this.stopped) {
            if (
              response &&
              response.headers &&
              response.headers.to &&
              response.headers.to.params &&
              response.headers.to.params.tag &&
              !this.defaultHeaders.to.params.tag
            ) {
              this.defaultHeaders.to.params.tag = response.headers.to.params.tag
            }
          }
          if (response.status >= 300) {
            reject(new Error(`${method} failed with status ${response.status}`))
          } else if (response.status < 200) {
            // Trying/Ringing, do nothing.
          } else {
            resolve(response)
          }
        }
      )
    })
  }

  on(type, cb) {
    this.cbs[type] = cb
  }

  start() {
    const host = ip.address()
    sip.start(
      {
        host,
        hostname: host,
        tls: {
          rejectUnauthorized: false
        }
      },
      rq => {
        if (rq.method === 'BYE') {
          this.cbs.end()
        }

        if (rq.headers.to.params.tag) {
          // check if it's an in dialog request
          const id = [
            rq.headers['call-id'],
            rq.headers.to.params.tag,
            rq.headers.from.params.tag
          ].join(':')

          if (dialogs[id]) {
            dialogs[id](rq)
          } else {
            sip.send(sip.makeResponse(rq, 481, "Call doesn't exists"))
          }
        } else {
          sip.send(sip.makeResponse(rq, 405, 'Method not allowed'))
        }
      }
    )
  }

  async invite() {
    const { from } = this.sipOptions
    const { address, audio, video } = this.rtpOptions

    const inviteResponse = await this.sipRequest({
      method: 'INVITE',
      headers: {
        supported: 'replaces, outbound',
        allow:
          'INVITE, ACK, CANCEL, OPTIONS, BYE, REFER, NOTIFY, MESSAGE, SUBSCRIBE, INFO, UPDATE',
        'content-type': 'application/sdp',
        contact: [{ uri: from }]
      },
      contentLines: [
        'v=0',
        `o=${from.split(':')[1].split('@')[0]} 3747 461 IN IP4 ${address}`,
        's=Talk',
        `c=IN IP4 ${address}`,
        'b=AS:380',
        't=0 0',
        'a=rtcp-xr:rcvr-rtt=all:10000 stat-summary=loss,dup,jitt,TTL voip-metrics',
        `m=audio ${audio.port} RTP/${audio.srtpKey ? 'S' : ''}AVP 110 0 101`,
        'a=rtpmap:110 mpeg4-generic/16000',
        'a=fmtp:110 mode=AAC-eld',
        'a=rtpmap:101 telephone-event/48000',
        'a=rtcp-mux',
        `m=video ${video.port} RTP/${video.srtpKey ? 'S' : ''}AVP 99`,
        'a=rtpmap:99 H264/90000',
        'a=fmtp:99 profile-level-id=42A01E; packetization-mode=1',
        'a=rtcp-mux'
      ]
    })

    const sections = sdp.splitSections(inviteResponse.content)
    const oLine = sdp.parseOLine(sections[0])
    const rtpOptions = {
      address: oLine.address,
      audio: getRtpDescription(sections, 'audio'),
      video: getRtpDescription(sections, 'video')
    }
    return rtpOptions
  }

  async ack() {
    await this.sipRequest({ method: 'ACK' })
  }

  async startRtp() {
    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/dtmf-relay'
      },
      contentLines: ['Signal=2', 'Duration=250']
    })

    await this.sipRequest({
      method: 'INFO',
      headers: {
        'Content-Type': 'application/media_control+xml'
      },
      contentLines: [
        '<?xml version="1.0" encoding="utf-8" ?><media_control>  <vc_primitive>    <to_encoder>      <picture_fast_update></picture_fast_update>    </to_encoder>  </vc_primitive></media_control>'
      ]
    })
  }
}
