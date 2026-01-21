import { jest } from "@jest/globals";
import { UserService } from "@/services/user.service";

describe("UserService", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("saves and loads profile with generated clientId", () => {
    const service = new UserService();

    service.saveProfile({ pseudo: "Alice" });
    const profile = service.loadProfile();

    expect(profile?.pseudo).toBe("Alice");
    expect(typeof profile?.clientId).toBe("string");
  });

  it("updates profile with merged values", () => {
    const service = new UserService();

    service.saveProfile({ pseudo: "Alice", phone: "0600000000", avatar: null, clientId: "client-1" });
    const updated = service.updateProfile({ pseudo: "  Bob  " });

    expect(updated?.pseudo).toBe("  Bob  ");
    expect(updated?.phone).toBe("0600000000");
    expect(updated?.clientId).toBe("client-1");
  });

  it("rejects empty pseudo updates", () => {
    const service = new UserService();

    service.saveProfile({ pseudo: "Alice" });
    const updated = service.updateProfile({ pseudo: "   " });

    expect(updated).toBeNull();
    expect(service.loadProfile()?.pseudo).toBe("Alice");
  });

  it("notifies listeners on save and clear", () => {
    const service = new UserService();
    const listener = jest.fn();

    const unsubscribe = service.onProfileChanged(listener);
    service.saveProfile({ pseudo: "Alice" });
    service.clearProfile();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0]?.pseudo).toBe("Alice");
    expect(listener.mock.calls[1][0]).toBeNull();
  });
});
