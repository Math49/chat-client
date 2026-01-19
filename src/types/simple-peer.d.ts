declare module "simple-peer" {
  interface SimplePeerOptions {
    initiator?: boolean;
    trickle?: boolean;
    stream?: MediaStream;
    config?: RTCConfiguration;
  }

  interface SimplePeerInstance extends EventTarget {
    signal(data: unknown): void;
    destroy(error?: Error): void;
    on(event: "signal", listener: (data: unknown) => void): this;
    on(event: "stream", listener: (stream: MediaStream) => void): this;
    on(event: "close", listener: () => void): this;
    on(event: "error", listener: (error: Error) => void): this;
  }

  const SimplePeer: {
    new (options?: SimplePeerOptions): SimplePeerInstance;
    (options?: SimplePeerOptions): SimplePeerInstance;
  };

  export type Instance = SimplePeerInstance;
  export default SimplePeer;
}
