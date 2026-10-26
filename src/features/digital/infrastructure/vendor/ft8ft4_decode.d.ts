// Módulo Emscripten (ES6) del decodificador FT8/FT4 de ChromeFT8 (MIT, basado en ft8_lib).
declare const createDecoderModule: (options: { locateFile: (path: string) => string }) => Promise<unknown>
export default createDecoderModule
