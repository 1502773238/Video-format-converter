declare module 'ffmpeg-static' {
  const path: string | null
  export default path
}

declare module '@ffprobe-installer/ffprobe' {
  const value: { path: string; version: string; url: string }
  export default value
}
