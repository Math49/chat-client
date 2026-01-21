import { ChatService } from "@/services/chat.service";

type Listener = (...args: any[]) => void;

type FakeSocket = {
  id: string;
  on: (event: string, handler: Listener) => FakeSocket;
  once: (event: string, handler: Listener) => FakeSocket;
  off: (event: string) => FakeSocket;
  emit: (event: string, ...args: any[]) => void;
  connect: () => void;
  disconnect: () => void;
  __trigger: (event: string, ...args: any[]) => void;
  __getEmitted: () => Array<{ event: string; args: any[] }>;
};

const createFakeSocket = (): FakeSocket => {
  const listeners = new Map<string, Array<{ handler: Listener; once: boolean }>>();
  const emitted: Array<{ event: string; args: any[] }> = [];

  const on = (event: string, handler: Listener, once = false) => {
    const list = listeners.get(event) ?? [];
    list.push({ handler, once });
    listeners.set(event, list);
  };

  const socket: FakeSocket = {
    id: "socket-1",
    on: (event, handler) => {
      on(event, handler, false);
      return socket;
    },
    once: (event, handler) => {
      on(event, handler, true);
      return socket;
    },
    off: (event) => {
      listeners.delete(event);
      return socket;
    },
    emit: (event, ...args) => {
      emitted.push({ event, args });
    },
    connect: () => {},
    disconnect: () => {},
    __trigger: (event, ...args) => {
      const list = listeners.get(event) ?? [];
      const remaining: Array<{ handler: Listener; once: boolean }> = [];
      list.forEach((entry) => {
        entry.handler(...args);
        if (!entry.once) remaining.push(entry);
      });
      if (remaining.length > 0) {
        listeners.set(event, remaining);
      } else {
        listeners.delete(event);
      }
    },
    __getEmitted: () => emitted,
  };

  return socket;
};

const socketState: { current: FakeSocket | null } = {
  current: null,
};

jest.mock("@/lib/socket-client", () => ({
  createChatSocket: () => {
    if (!socketState.current) {
      socketState.current = createFakeSocket();
    }
    return socketState.current;
  },
}));

describe("ChatService", () => {
  beforeEach(() => {
    socketState.current = createFakeSocket();
  });

  it("connects and joins a room", async () => {
    const service = new ChatService();
    const statusUpdates: string[] = [];

    service.on("statusChanged", (status) => statusUpdates.push(status));

    const connectPromise = service.connect({
      roomName: "general",
      pseudo: "Alice",
    });

    socketState.current?.__trigger("connect");
    await connectPromise;

    const join = socketState.current
      ? socketState.current.__getEmitted().find((entry) => entry.event === "chat-join-room")
      : undefined;

    expect(join?.args[0]).toEqual(
      expect.objectContaining({
        pseudo: "Alice",
        roomName: "general",
      })
    );
    expect(service.getStatus()).toBe("connected");
    expect(statusUpdates).toEqual(expect.arrayContaining(["connecting", "connected"]));
  });

  it("sends messages with trimmed content", async () => {
    const service = new ChatService();

    const connectPromise = service.connect({
      roomName: "general",
      pseudo: "Alice",
    });
    socketState.current?.__trigger("connect");
    await connectPromise;

    service.sendMessage("general", "  hello  ");

    const sent = socketState.current
      ? socketState.current.__getEmitted().find((entry) => entry.event === "chat-msg")
      : undefined;

    expect(sent?.args[0]).toEqual({ content: "hello", roomName: "general" });
  });

  it("sends peer signals with video flag", async () => {
    const service = new ChatService();

    const connectPromise = service.connect({
      roomName: "general",
      pseudo: "Alice",
    });
    socketState.current?.__trigger("connect");
    await connectPromise;

    service.sendPeerSignal("peer-1", { signal: "offer", videoEnabled: true }, "general");

    const sent = socketState.current
      ? socketState.current.__getEmitted().find((entry) => entry.event === "peer-signal")
      : undefined;

    expect(sent?.args[0]).toEqual(
      expect.objectContaining({
        id: "peer-1",
        roomName: "general",
        signal: "offer",
        videoEnabled: true,
      })
    );
  });
});
