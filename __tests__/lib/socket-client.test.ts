import { jest } from "@jest/globals";

const ioMock = jest.fn(() => ({}));

jest.mock("socket.io-client", () => ({
  io: ioMock,
}));

describe("socket-client", () => {
  const originalUrl = process.env.NEXT_PUBLIC_CHAT_SOCKET_URL;

  afterAll(() => {
    process.env.NEXT_PUBLIC_CHAT_SOCKET_URL = originalUrl;
  });

  it("creates a socket with expected options", async () => {
    process.env.NEXT_PUBLIC_CHAT_SOCKET_URL = "http://localhost:9999";
    jest.resetModules();

    const { createChatSocket } = await import("@/lib/socket-client");

    createChatSocket();

    expect(ioMock).toHaveBeenCalledWith(
      "http://localhost:9999",
      expect.objectContaining({
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 10,
        transports: ["websocket"],
      })
    );
  });
});
