const ringApi = require('ring-api')
require('dotenv').config()

module.exports = async cameraName => {
  let ring
  try {
    ring = await ringApi({
      email: process.env.RING_EMAIL,
      password: process.env.RING_PASSWORD
    })
  } catch (e) {
    console.error(e)
    return
  }

  try {
    const devices = await ring.devices()
    const backyardCamera = devices.cameras.find(
      camera => camera.description === cameraName
    )

    const live = await backyardCamera.liveStream
    return {
      to: live.sip_to,
      from: live.sip_from,
      dingId: live.id_str
    }
  } catch (e) {
    console.error(e)
  }
}
