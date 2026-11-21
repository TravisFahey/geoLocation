const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const React = require("react");
const { act, create } = require("react-test-renderer");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, mocks, fetch, schedule = setTimeout) {
  const code = babel.transformSync(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    {
      configFile: false,
      babelrc: false,
      plugins: ["@babel/plugin-transform-react-jsx", "@babel/plugin-transform-modules-commonjs"],
    }
  ).code;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "setTimeout", "clearTimeout", code)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    module, module.exports, fetch, schedule, clearTimeout
  );
  return module.exports;
}

const fix = { coords: { latitude: 43.84, longitude: -79.08 } };
const place = { lat: 43.841, lon: -79.081, tags: { name: "Local Restaurant", cuisine: "pizza" } };

async function mount(options = {}) {
  let removed = 0;
  let currentCalls = 0;
  let onPosition;
  let restaurantRequest;
  const location = {
    Accuracy: { Balanced: 3, High: 4 },
    requestForegroundPermissionsAsync: options.permission || (async () => ({ status: "granted" })),
    hasServicesEnabledAsync: async () => options.services !== false,
    getCurrentPositionAsync: async () => {
      currentCalls++;
      return options.pending ? new Promise(() => {}) : fix;
    },
    watchPositionAsync: async (_, callback) => {
      onPosition = callback;
      return { remove: () => removed++ };
    },
  };
  const fetch = async (url, request) => {
    restaurantRequest = { url, ...request };
    if (options.networkError) throw new Error("Offline");
    if (options.httpError) return { ok: false, status: options.httpError };
    return { ok: true, json: async () => ({ elements: options.empty ? [] : [place] }) };
  };
  const timers = options.fastTimeout ? (callback, delay) => setTimeout(callback, delay === 20000 ? 5 : delay) : setTimeout;
  const mocks = {
    "react-native": { View: "View", Text: "Text", Button: "Button", ActivityIndicator: "Spinner", StatusBar: { setBarStyle() {} } },
    "react-native-maps": { __esModule: true, default: "MapView", Marker: "Marker" },
    "expo-location": location,
    "./styles": { __esModule: true, default: {} },
    "./withTimeout": load("withTimeout.js", {}, fetch, timers),
  };
  const App = load(options.web ? "App.web.js" : "App.js", mocks, fetch).default;
  let renderer;
  await act(async () => { renderer = create(React.createElement(App)); });
  return {
    renderer,
    text: () => JSON.stringify(renderer.toJSON()),
    currentCalls: () => currentCalls,
    removed: () => removed,
    restaurantRequest: () => restaurantRequest,
    move: async (position) => act(async () => onPosition(position)),
    close: async () => act(async () => renderer.unmount()),
  };
}

test("map is visible while permission is pending", async () => {
  const app = await mount({ permission: () => new Promise(() => {}) });
  assert.equal(app.renderer.root.findAllByType("MapView").length, 1);
  assert.equal(app.renderer.root.findAllByType("Spinner").length, 1);
  assert.equal(app.currentCalls(), 0);
  await app.close();
});

test("GPS and restaurant render with the current Marker API; updates and cleanup work", async () => {
  const app = await mount();
  const marker = app.renderer.root.findByType("Marker");
  assert.equal(marker.props.title, "Local Restaurant");
  assert.deepEqual(marker.props.coordinate, { latitude: place.lat, longitude: place.lon });
  assert.equal(app.renderer.root.findByType("MapView").props.showsUserLocation, true);
  assert.match(app.restaurantRequest().headers["User-Agent"], /GeoLocationChapter21/);
  await app.move({ coords: { latitude: 43.85, longitude: -79.09 } });
  assert.equal(app.renderer.root.findByType("MapView").props.region.latitude, (43.85 + place.lat) / 2);
  await app.close();
  assert.equal(app.removed(), 1);
});

test("permission denial displays guidance and retry can recover", async () => {
  let granted = false;
  const app = await mount({ permission: async () => ({ status: granted ? "granted" : "denied" }) });
  assert.match(app.text(), /permission was denied/);
  assert.equal(app.currentCalls(), 0);
  granted = true;
  await act(async () => app.renderer.root.findByType("Button").props.onPress());
  assert.equal(app.renderer.root.findAllByType("Marker").length, 1);
  await app.close();
});

test("disabled location services do not start a GPS request", async () => {
  const app = await mount({ services: false });
  assert.match(app.text(), /Location services are off/);
  assert.equal(app.currentCalls(), 0);
  await app.close();
});

test("a GPS request that never resolves stops loading and gives a retry message", async () => {
  const app = await mount({ pending: true, fastTimeout: true });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 20)));
  assert.match(app.text(), /No GPS fix after 20 seconds/);
  assert.equal(app.renderer.root.findAllByType("Spinner").length, 0);
  assert.equal(app.renderer.root.findAllByType("MapView").length, 1);
  await app.close();
});

test("restaurant network failure keeps the GPS map visible", async () => {
  const app = await mount({ networkError: true });
  assert.match(app.text(), /Check your connection/);
  assert.equal(app.renderer.root.findAllByType("MapView").length, 1);
  assert.equal(app.renderer.root.findAllByType("Marker").length, 0);
  await app.close();
});

test("no nearby restaurant shows an empty result", async () => {
  const app = await mount({ empty: true });
  assert.match(app.text(), /No named restaurant was found/);
  await app.close();
});

test("restaurant HTTP rejection displays its status and keeps the map", async () => {
  const app = await mount({ httpError: 406 });
  assert.match(app.text(), /HTTP 406/);
  assert.equal(app.renderer.root.findAllByType("MapView").length, 1);
  await app.close();
});

test("browser explains the native requirement without starting GPS or native maps", async () => {
  const app = await mount({ web: true });
  assert.match(app.text(), /Open this app in Expo Go/);
  assert.equal(app.currentCalls(), 0);
  assert.equal(app.renderer.root.findAllByType("MapView").length, 0);
  await app.close();
});
