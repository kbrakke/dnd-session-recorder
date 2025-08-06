declare module 'ffprobe-static' {
  interface FFProbeStatic {
    path: string;
  }
  const ffprobe: FFProbeStatic;
  export = ffprobe;
}