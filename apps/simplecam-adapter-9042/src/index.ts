#!/usr/bin/env node
/**
 * SimpleCAM Adapter for Machine 9042
 * Consumes Server-Sent Events from SimpleCAM backend (/stream/machine-9042/state)
 * Publishes AG2 v0.17.1 events to MQTT broker for Pleiades integration
 *
 * Topics:
 * - machines/united-grinding_simplecam_9042/umati/* (state values)
 * - machines/united-grinding_simplecam_9042/events/* (CloudEvents)
 */

import mqtt from "mqtt";
import http from "http";
import crypto from "crypto";

const SIMPLECAM_SSE_URL =
  process.env.SIMPLECAM_SSE_URL || "http://localhost:5450/stream/machine-9042/state";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://broker:1883";
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "simplecam-adapter-9042";
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "3042", 10);

// Machine metadata (AG2 v0.17.1 format)
const MANUFACTURER = "united-grinding";
const MODEL = "simplecam";
const SERIAL_NUMBER = "9042";
const MACHINE_ID = `${MANUFACTURER}_${MODEL}_${SERIAL_NUMBER}`;
const BASE_TOPIC = `machines/${MACHINE_ID}/umati`;
const EVENTS_TOPIC = `machines/${MACHINE_ID}/events`;

let mqttClient: mqtt.MqttClient;
let isConnected = false;
let heartbeatTimer: NodeJS.Timeout | undefined;

/**
 * Connect to MQTT broker
 */
async function connectMqtt(): Promise<void> {
  return new Promise((resolve, reject) => {
    mqttClient = mqtt.connect(MQTT_BROKER_URL, {
      clientId: MQTT_CLIENT_ID,
      clean: true,
      reconnectPeriod: 5000,
    });

    mqttClient.on("connect", () => {
      console.log("[MQTT] Connected to broker");
      isConnected = true;
      startHeartbeat();
      resolve();
    });

    mqttClient.on("error", (err) => {
      console.error("[MQTT] Error:", err.message);
      isConnected = false;
      reject(err);
    });

    mqttClient.on("close", () => {
      console.log("[MQTT] Disconnected from broker");
      isConnected = false;
    });
  });
}

/**
 * Send heartbeat every 10 seconds (AG2 requirement)
 */
function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    if (isConnected) {
      const heartbeat = Math.floor(Date.now() / 1000);
      mqttClient.publish(
        `${BASE_TOPIC}/Connection/Heartbeat`,
        JSON.stringify({
          value: heartbeat,
          timestamp: new Date().toISOString(),
        }),
        { retain: true }
      );
    }
  }, 10000);
}

/**
 * Create CloudEvent envelope (AG2 v0.17.1)
 */
function createCloudEvent(type: string, subject: string, data: any): any {
  return {
    specversion: "1.0",
    type: `com.pleiades.simplecam.${type}`,
    source: `machines/${MACHINE_ID}`,
    subject,
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    datacontenttype: "application/json",
    data,
  };
}

/**
 * Publish state value (retained)
 */
function publishState(path: string, value: any, timestamp: string): void {
  if (!isConnected) return;

  const topic = `${BASE_TOPIC}/${path}`;
  const payload = JSON.stringify({
    value,
    timestamp,
  });

  mqttClient.publish(topic, payload, { retain: true }, (err) => {
    if (err) {
      console.error(`[MQTT] Publish error on ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Published ${path}`);
    }
  });
}

/**
 * Publish CloudEvent (not retained)
 */
function publishEvent(type: string, subject: string, data: any): void {
  if (!isConnected) return;

  const topic = `${EVENTS_TOPIC}/${type}`;
  const event = createCloudEvent(type, subject, data);
  const payload = JSON.stringify(event);

  mqttClient.publish(topic, payload, { retain: false }, (err) => {
    if (err) {
      console.error(`[MQTT] Event publish error on ${topic}:`, err.message);
    } else {
      console.log(`[MQTT] Published event ${type}`);
    }
  });
}

/**
 * Map AG2 event to MQTT topics
 */
function mapEventToMqtt(event: any): void {
  const path = event.path;
  const value = event.value;
  const timestamp = event.timestamp;

  if (!path || value === undefined) {
    console.warn("[Adapter] Skipping malformed event:", event);
    return;
  }

  // Publish state value (retained)
  publishState(path, value, timestamp);

  // Optionally publish as CloudEvent for state changes
  if (path === "State/Status" || path === "Connection/State") {
    publishEvent("StateChanged", path, {
      path,
      value,
      timestamp,
    });
  }
}

/**
 * Map full state snapshot
 */
function mapStateSnapshot(state: any): void {
  // Identification (static, only once)
  if (state.identification) {
    Object.entries(state.identification).forEach(([key, val]) => {
      publishState(`Identification/${key}`, val, new Date().toISOString());
    });
  }

  // Connection state
  if (state.connection?.state) {
    mapEventToMqtt(state.connection.state);
  }

  // State.Status snapshot
  if (state.state?.status) {
    mapEventToMqtt(state.state.status);
  }

  // Active alerts
  if (state.notification?.activeAlerts) {
    mapEventToMqtt(state.notification.activeAlerts);
  }
}

/**
 * Connect to SSE stream and listen for events
 */
async function listenToSseStream(): Promise<void> {
  console.log(`[SSE] Connecting to ${SIMPLECAM_SSE_URL}`);

  try {
    const response = await fetch(SIMPLECAM_SSE_URL);

    if (!response.ok) {
      throw new Error(`SSE endpoint returned ${response.status}`);
    }

    console.log("[SSE] Connected, listening for events...");

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines[lines.length - 1];

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];

        if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          try {
            const data = JSON.parse(dataStr);
            if (data.identification) {
              mapStateSnapshot(data);
            } else if (data.path) {
              mapEventToMqtt(data);
            }
          } catch (err) {
            console.warn("[SSE] Failed to parse JSON:", err instanceof Error ? err.message : String(err));
          }
        }
      }
    }
  } catch (err) {
    console.error("[SSE] Stream error:", err instanceof Error ? err.message : String(err));
    setTimeout(() => listenToSseStream(), 5000);
  }
}

/**
 * Health check endpoint
 */
function startHealthEndpoint(): void {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      if (isConnected) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("OK");
      } else {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("Service Unavailable");
      }
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(HEALTH_PORT, "0.0.0.0", () => {
    console.log(`[Health] Listening on port ${HEALTH_PORT}`);
  });
}

/**
 * Main
 */
async function main(): Promise<void> {
  console.log("🚀 SimpleCAM Adapter 9042 (AG2 v0.17.1) starting...");
  console.log(`   SSE URL: ${SIMPLECAM_SSE_URL}`);
  console.log(`   MQTT: ${MQTT_BROKER_URL}`);
  console.log(`   Machine ID: ${MACHINE_ID}`);
  console.log(`   Health: http://0.0.0.0:${HEALTH_PORT}/health`);

  startHealthEndpoint();

  try {
    await connectMqtt();
    console.log("[Adapter] Ready!");
    listenToSseStream().catch((err) => {
      console.error("[Adapter] Fatal error:", err);
      process.exit(1);
    });
  } catch (err) {
    console.error("[Adapter] Failed to initialize:", err);
    process.exit(1);
  }
}

main();
