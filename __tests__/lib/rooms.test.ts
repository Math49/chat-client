import { getAvailableRooms, persistRooms, rememberRoom } from "@/lib/rooms";

describe("rooms", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns default rooms when no storage", () => {
    const rooms = getAvailableRooms();
    expect(rooms).toEqual(expect.arrayContaining(["general", "pwa", "design", "support", "tech"]));
  });

  it("persists and normalizes rooms", () => {
    persistRooms(["Mon Salon", "mon-salon", "  Tech  "]);
    const rooms = getAvailableRooms();
    expect(rooms).toEqual(expect.arrayContaining(["mon-salon", "tech"]));
  });

  it("remembers a room once", () => {
    rememberRoom("New Room");
    rememberRoom("new-room");
    const rooms = getAvailableRooms();
    const occurrences = rooms.filter((room) => room === "new-room").length;
    expect(occurrences).toBe(1);
  });
});
