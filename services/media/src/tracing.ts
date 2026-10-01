/**
 * OpenTelemetry tracing initialisation for the media service.
 *
 * This module MUST be imported before any other module in src/index.ts so
 * that auto-instrumentations (HTTP, Express) are registered before those
 * libraries are required.
 *
 * Span names follow OTel HTTP semantic conventions:
 *   https://opentelemetry.io/docs/specs/semconv/http/http-spans/
 * The @opentelemetry/auto-instrumentations-node package produces spans like
 *   "GET /health" with http.method, http.route, http.status_code attributes.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const OTLP_ENDPOINT =
  process.env["OTEL_EXPORTER_OTLP_ENDPOINT"] ??
  "http://jaeger:4318/v1/traces";

const exporter = new OTLPTraceExporter({ url: OTLP_ENDPOINT });

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: "media",
    [SEMRESATTRS_SERVICE_VERSION]: "0.1.0",
  }),
  traceExporter: exporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable noisy fs instrumentation; keep HTTP + Express
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("OTel SDK shutdown error", err);
      process.exit(1);
    });
});
