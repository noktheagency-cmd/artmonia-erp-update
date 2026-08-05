import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionDevice } from "./session-device";

test("Windows Edge session is identified as a desktop", () => {
  const result = parseSessionDevice(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36 Edg/136.0.3240.64",
    { platform: '"Windows"', platformVersion: '"15.0.0"' },
  );

  assert.deepEqual(result, {
    deviceType: "DESKTOP",
    deviceName: "Windows kompüter",
    browserName: "Microsoft Edge",
    browserVersion: "136.0",
    osName: "Windows 11",
    osVersion: "15.0.0",
  });
});

test("iPhone Safari session is identified as mobile", () => {
  const result = parseSessionDevice(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1",
  );

  assert.equal(result.deviceType, "MOBILE");
  assert.equal(result.deviceName, "iPhone");
  assert.equal(result.browserName, "Safari");
  assert.equal(result.osName, "iOS");
  assert.equal(result.osVersion, "17.5");
});

test("Android tablet model is preserved", () => {
  const result = parseSessionDevice(
    "Mozilla/5.0 (Linux; Android 14; SM-X710 Build/UP1A.231005.007) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
  );

  assert.equal(result.deviceType, "TABLET");
  assert.equal(result.deviceName, "SM-X710");
  assert.equal(result.browserName, "Chrome");
  assert.equal(result.osName, "Android");
});
