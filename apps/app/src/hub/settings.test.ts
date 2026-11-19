import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

import { resolveAppLinks, validateApp } from "@pleiades/hub-sdk/contract"

import { hubRegistration, hubSettings } from "./settings.ts"

const broker = "mqtt://localhost:1883"

test("without HUB_MQTT_URL the app does not register, whatever HUB_APP_URL says", () => {
  assert.equal(hubSettings({}), undefined)
  assert.equal(hubSettings({ HUB_MQTT_URL: "" }), undefined)
  assert.equal(hubSettings({ HUB_APP_URL: "http://localhost:5600/" }), undefined)
  assert.equal(hubSettings({ HUB_APP_URL: "javascript:alert(1)" }), undefined)
  assert.equal(hubSettings({ HUB_MQTT_URL: "", HUB_APP_URL: "//evil.example/" }), undefined)
})

test("HUB_REGISTRATION=false switches the registration off, whatever the other settings say", () => {
  assert.equal(hubSettings({ HUB_REGISTRATION: "false", HUB_MQTT_URL: broker }), undefined)
  assert.equal(hubSettings({ HUB_REGISTRATION: "false", HUB_MQTT_URL: "not a url" }), undefined)
  assert.equal(hubSettings({ HUB_REGISTRATION: "false", HUB_MQTT_URL: broker, HUB_APP_URL: "javascript:alert(1)" }), undefined)
})

test("HUB_REGISTRATION=true, empty or unset leaves the decision to HUB_MQTT_URL", () => {
  for (const HUB_REGISTRATION of ["true", "", undefined]) {
    assert.equal(hubSettings({ HUB_REGISTRATION, HUB_MQTT_URL: broker })?.brokerUrl, broker)
    assert.equal(hubSettings({ HUB_REGISTRATION }), undefined)
  }
})

test("any other HUB_REGISTRATION is an error that names the setting", () => {
  for (const HUB_REGISTRATION of ["no", "False", "0", "off"]) {
    assert.throws(() => hubSettings({ HUB_REGISTRATION, HUB_MQTT_URL: broker }), /HUB_REGISTRATION must be true or false/)
  }
})

test("with HUB_MQTT_URL alone the address is the one of the development server", () => {
  assert.deepEqual(hubSettings({ HUB_MQTT_URL: broker }), { brokerUrl: broker, appUrl: "http://localhost:3000/" })
  assert.deepEqual(hubSettings({ HUB_MQTT_URL: broker, HUB_APP_URL: "" }), {
    brokerUrl: broker,
    appUrl: "http://localhost:3000/",
  })
})

test("HUB_APP_URL is a URL or a path, and is passed on unchanged", () => {
  assert.deepEqual(hubSettings({ HUB_MQTT_URL: broker, HUB_APP_URL: "https://playground.example/app" }), {
    brokerUrl: broker,
    appUrl: "https://playground.example/app",
  })
  assert.deepEqual(hubSettings({ HUB_MQTT_URL: "wss://broker.example/mqtt", HUB_APP_URL: "/playground/" }), {
    brokerUrl: "wss://broker.example/mqtt",
    appUrl: "/playground/",
  })
})

test("every scheme a broker speaks counts", () => {
  for (const url of ["mqtt://broker:1883", "mqtts://broker:8883", "ws://broker:9001/mqtt", "wss://broker/mqtt"]) {
    assert.equal(hubSettings({ HUB_MQTT_URL: url })?.brokerUrl, url)
  }
})

test("an invalid HUB_MQTT_URL throws and names the setting", () => {
  for (const url of ["http://x", "localhost:1883", "mqtt://", " "]) {
    assert.throws(() => hubSettings({ HUB_MQTT_URL: url }), /^Error: HUB_MQTT_URL /, url)
  }
})

test("an invalid HUB_APP_URL throws and names the setting", () => {
  for (const url of ["javascript:alert(1)", "//evil.example/", "playground/", "ftp://files.example/", "/a b/"]) {
    assert.throws(() => hubSettings({ HUB_MQTT_URL: broker, HUB_APP_URL: url }), /^Error: HUB_APP_URL /, url)
  }
})

test("a message never prints the broker URL: it may carry a password", () => {
  const messageOf = (env: Record<string, string>) => {
    try {
      hubSettings(env)
    } catch (error) {
      return (error as Error).message
    }
    return assert.fail("the settings are invalid and did not throw")
  }
  const invalidBroker = messageOf({ HUB_MQTT_URL: "http://machine:secret-word@broker.example:1883" })
  const invalidAddress = messageOf({
    HUB_MQTT_URL: "mqtt://machine:secret-word@broker.example:1883",
    HUB_APP_URL: "javascript:alert(1)",
  })
  for (const message of [invalidBroker, invalidAddress]) {
    assert.equal(message.includes("secret-word"), false, message)
    assert.equal(message.includes("broker.example"), false, message)
  }
})

test("the registration is one client with one app: the Playground under the address", () => {
  assert.deepEqual(hubRegistration("/playground/"), {
    clientId: "pleiades-playground",
    apps: [
      {
        id: "pleiades-playground",
        label: { en: "Playground", de: "Playground" },
        description: {
          en: "What every machine does now, with a chat for questions",
          de: "Was jede Maschine gerade tut, mit einem Chat für Fragen",
        },
        icon: "hub-icon.svg",
        url: "/playground/",
      },
    ],
  })
})

test("the app of the registration is valid by the contract of the hub", () => {
  for (const address of ["http://localhost:3000/", "/playground/"]) {
    const [app] = hubRegistration(address).apps
    assert.deepEqual(validateApp(app), { ok: true, app })
  }
})

test("the icon is looked for next to the app", () => {
  const linksOf = (env: Record<string, string>, hub: string) => {
    const settings = hubSettings({ HUB_MQTT_URL: broker, ...env })
    assert.ok(settings)
    const [app] = hubRegistration(settings.appUrl).apps
    assert.ok(app)
    return resolveAppLinks(app, hub)
  }
  assert.deepEqual(linksOf({}, "http://hub.example"), {
    url: "http://localhost:3000/",
    icon: "http://localhost:3000/hub-icon.svg",
  })
  assert.deepEqual(linksOf({ HUB_APP_URL: "/playground/" }, "http://hub.example"), {
    url: "http://hub.example/playground/",
    icon: "http://hub.example/playground/hub-icon.svg",
  })
})

test("the icon file is square and brings everything it shows: the hub draws it as an image", () => {
  const icon = readFileSync(new URL("../../public/hub-icon.svg", import.meta.url), "utf8")
  const [, width, height] = /viewBox="0 0 (\d+) (\d+)"/.exec(icon) ?? []
  assert.ok(width, "the icon has a viewBox that starts at 0 0")
  assert.equal(width, height)
  // No script, no colour of the page and no file from outside: none of them reaches an image.
  for (const banned of ["<script", "currentColor", "href", "<foreignObject", "var(", "<style"]) {
    assert.equal(icon.includes(banned), false, `the icon contains ${banned}`)
  }
  assert.ok(Buffer.byteLength(icon) < 2048, "the icon is a small file")
})
