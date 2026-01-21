import { jest } from "@jest/globals";
import type { CallState } from "@/services/call.service";

type Handler = (...args: any[]) => void;

class FakePeer {
  handlers = new Map<string, Handler[]>();
  signal = jest.fn();
  destroy = jest.fn();

  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
    return this;
  }

  __emit(event: string, ...args: any[]) {
    const list = this.handlers.get(event) ?? [];
    list.forEach((handler) => handler(...args));
  }
}

let lastPeer: FakePeer | null = null;

jest.mock("simple-peer", () => ({
  __esModule: true,
  default: jest.fn(() => {
    lastPeer = new FakePeer();
    return lastPeer;
  }),
  __getLastPeer: () => lastPeer,
}));

const { CallService } = require("@/services/call.service");

const setMediaDevices = (stream: MediaStream) => {
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: jest.fn().mockResolvedValue(stream),
    },
    configurable: true,
  });
};

describe("CallService", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
  });

  it("transitions to active when remote stream arrives", async () => {
    const service = new CallService();
    const states: CallState[] = [];
    const fakeStream = { getTracks: jest.fn().mockReturnValue([]) } as unknown as MediaStream;

    setMediaDevices(fakeStream);
    service.on("stateChanged", (state) => states.push(state));

    await service.startCall("peer-1", "Bob", jest.fn(), false);

    const simplePeerModule = jest.requireMock("simple-peer") as any;
    const peer = simplePeerModule.__getLastPeer() as FakePeer;
    const remoteStream = { getTracks: jest.fn().mockReturnValue([]) } as unknown as MediaStream;
    peer.__emit("stream", remoteStream);

    expect(states[0].phase).toBe("dialing");
    expect(states[states.length - 1]).toEqual(
      expect.objectContaining({
        phase: "active",
        peerId: "peer-1",
        peerPseudo: "Bob",
      })
    );
  });

  it("buffers incoming signal and flushes on accept", async () => {
    const service = new CallService();
    const fakeStream = { getTracks: jest.fn().mockReturnValue([]) } as unknown as MediaStream;

    setMediaDevices(fakeStream);

    service.handleIncomingSignal("peer-2", "Alice", { type: "offer" }, false);
    await service.acceptCall("peer-2", "Alice", jest.fn(), false);

    const simplePeerModule = jest.requireMock("simple-peer") as any;
    const peer = simplePeerModule.__getLastPeer() as FakePeer;
    expect(peer.signal).toHaveBeenCalledWith({ type: "offer" });
  });

  it("resets to idle on control hangup", () => {
    const service = new CallService();
    let lastState: CallState = { phase: "idle" };

    service.on("stateChanged", (state) => {
      lastState = state;
    });

    service.handleIncomingSignal("peer-3", "Carl", { type: "hangup" }, false);

    expect(lastState.phase).toBe("idle");
  });
});
