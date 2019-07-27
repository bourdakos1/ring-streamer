# Ring Streamer
Get a video stream from a Ring device.

## Setup
Install the dependencies:
```bash
npm install
```

Add your Ring credentials to a `.env` file:
```bash
RING_EMAIL=myemail123@gmail.com
RING_PASSWORD=password123
```

Replace `CAMERA_TO_STREAM` in `main.js` with the camera name that you want to stream.

## Usage
Run the `main.js` to get streaming data outputted to a file named `output.h264`:
```bash
node main.js
```

Convert `output.h264` to an mp4 for viewing:
```bash
ffmpeg -i output.h264 output.mp4
```