#!/usr/bin/env node
/**
 * SimpleCAM SSE Adapter for Machine 9042
 * Consumes AG2 state events from SimpleCAM backend (port 5450)
 * Publishes to MQTT broker for Pleiades integration
 */

import mqtt from "mqtt";
import http from "http";

const SIMPLECAM_SSE_URL =
  process.env.SIMPLECAM_SSE_URL || "http://localhost:5450/stream/machine-9042/state";
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://broker:1883";
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || "simplecam-adapter-9042";
const HEALTH_PORT = parseInt(process.env.HEALTH_PORT || "3042", 10);

// Machine metadata
const MACHINE_SERIAL = "9042";
const BASE_TOPIC = `machines/${MACHINE_SERIAL}/umati`;

let mqttClient: mqtt.MqttClient;
let isConnected = false;
let heartbeatTimer: NodeJS.Timeout;

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
      const heartbeat = {
        value: Math.floor(Date.now() / 1000),
        timestamp: new Date().toISOString(),
      };
      mqttClient.publish(
        `${BASE_TOPIC}/Connection/Heartbeat`,
        JSON.stringify(heartbeat.value),
        { retain: true }
      );
    }
  }, 10000);
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

  const topic = `${BASE_TOPIC}/${path}`;
  const payload = JSON.stringify({
    value,
    timestamp,
  });

  if (isConnected) {
    mqttClient.publish(topic, payload, { retain: true }, (err) => {
      if (err) {
        console.error(`[MQTT] Publish error on ${topic}:`, err.message);
      } else {
        console.log(`[MQTT] Published ${topic}`);
      }
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
      const topic = `${BASE_TOPIC}/Identification/${key}`;
      const payload = JSON.stringify({
        value: val,
        timestamp: new Date().toISOString(),
      });
      if (isConnected) {
        mqttClient.publish(topic, payload, { retain: true });
      }
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
    // Using fetch with manual SSE parsing (eventsource package may not be available)
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

        // Parse SSE format: "event: name" and "data: {...}"
        if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          try {
            const data = JSON.parse(dataStr);
            if (data.identification) {
              // Full state snapshot
              mapStateSnapshot(data);
            } else if (data.path) {
              // Single event
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
    // Reconnect after delay
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
  console.log("🚀 SimpleCAM Adapter 9042 starting...");
  console.log(`   SSE URL: ${SIMPLECAM_SSE_URL}`);
  console.log(`   MQTT: ${MQTT_BROKER_URL}`);
  console.log(`   Health: http://0.0.0.0:${HEALTH_PORT}/health`);

  startHealthEndpoint();

  try {
    await connectMqtt();
    console.log("[Adapter] Ready!");
    // Start listening to SSE stream (runs in background)
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
