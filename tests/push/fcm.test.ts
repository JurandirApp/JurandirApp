import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateKeyPairSync } from "crypto";

const deleteDeviceToken = vi.fn();
vi.mock("@/lib/db/devices", () => ({ deleteDeviceToken }));

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function res(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

beforeEach(() => {
  vi.resetModules();
  deleteDeviceToken.mockReset();
  process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
    client_email: "x@y.iam", private_key: pem, project_id: "proj",
  });
  delete process.env.FCM_PROJECT_ID;
});

describe("sendPush", () => {
  it("envia a mensagem FCM certa", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(200, { access_token: "at", expires_in: 3600 }))
      .mockResolvedValueOnce(res(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    const { sendPush } = await import("@/lib/push/fcm");
    await sendPush(["tok1"], "T", "B");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://fcm.googleapis.com/v1/projects/proj/messages:send");
    expect(init.headers.Authorization).toBe("Bearer at");
    const sent = JSON.parse(init.body);
    expect(sent.message.token).toBe("tok1");
    expect(sent.message.notification.title).toBe("T");
    expect(sent.message.notification.body).toBe("B");
  });

  it("remove o token em 404/UNREGISTERED", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(res(200, { access_token: "at", expires_in: 3600 }))
      .mockResolvedValueOnce(res(404, "UNREGISTERED")));
    const { sendPush } = await import("@/lib/push/fcm");
    await sendPush(["tok1"], "T", "B");
    expect(deleteDeviceToken).toHaveBeenCalledWith("tok1");
  });

  it("não faz nada sem service account", async () => {
    delete process.env.FCM_SERVICE_ACCOUNT_JSON;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { sendPush } = await import("@/lib/push/fcm");
    await expect(sendPush(["t"], "a", "b")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
