declare module 'ft8js' {
  export interface FTReceivedMessage {
    db: number
    dt: number
    df: number
    text: string
  }
  export function decode(input: Float32Array<ArrayBuffer>): Promise<FTReceivedMessage[]>
  export function encode(input: string, frequency: number): Promise<Float32Array<ArrayBuffer> | null>
}
