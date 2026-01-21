import {
  addRoomMessage,
  loadRoomMessages,
  clearRoomMessages,
  clearAllMessages,
} from "@/lib/message-storage";

describe("message-storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("adds and loads messages for a room", () => {
    addRoomMessage("general", {
      id: "m1",
      pseudo: "Alice",
      content: "Hello",
      categorie: "MESSAGE",
      isMine: true,
    });
    addRoomMessage("general", {
      id: "m2",
      pseudo: "Bob",
      content: "Hi",
      categorie: "MESSAGE",
      isMine: false,
    });

    const messages = loadRoomMessages("general");
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe("Hello");
  });

  it("clears messages for a room", () => {
    addRoomMessage("general", {
      id: "m1",
      pseudo: "Alice",
      content: "Hello",
      categorie: "MESSAGE",
    });

    clearRoomMessages("general");
    const messages = loadRoomMessages("general");
    expect(messages).toHaveLength(0);
  });

  it("clears all messages", () => {
    addRoomMessage("general", {
      id: "m1",
      pseudo: "Alice",
      content: "Hello",
      categorie: "MESSAGE",
    });

    clearAllMessages();
    const messages = loadRoomMessages("general");
    expect(messages).toHaveLength(0);
  });
});
