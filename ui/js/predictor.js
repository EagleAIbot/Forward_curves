/*!
 * © 2025 Cayman Sunsets Holidays Ltd. All rights reserved.
 *
 * This software and its source code are proprietary and confidential.
 * Unauthorized copying, distribution, or modification of this file, in
 * whole or in part, without the express written permission of
 * Cayman Sunsets Holidays Ltd is strictly prohibited.
 */
import { ChartManager } from './ChartManager.js?v=20260202e';
import { UIManager } from './UIManager.js?v=20260202e';
import { initializeTracing, startActiveSpan } from './tracing.js?v=20260202e';
import { logger, SERVICE_NAME, ENVIRONMENT } from './state.js?v=20260202e';

// Expose managers globally for inline scripts
window.ChartManager = ChartManager;
console.log('✅ window.ChartManager set:', !!window.ChartManager);

// --- Initialization ---
/**
 * Entry point: Initializes the chart, sets up UI event listeners, and performs the initial data load
 * once the DOM is fully loaded.
 */
window.addEventListener('DOMContentLoaded', async () => {
  // Initialize browser tracing; export to same-origin proxy
  await initializeTracing({
    serviceName: SERVICE_NAME,
    environment: ENVIRONMENT,
    otlpTracesUrl: './v1/traces',
  });

  await startActiveSpan('ui.init', async () => {
    // Correlated logs: now inside an active span
    const getCtx = (typeof window !== 'undefined' && typeof window.__otel_get_active_span_context === 'function')
      ? window.__otel_get_active_span_context
      : null;
    const sc = getCtx ? getCtx() : null;
    logger.info('Correlation test: span context', {
      ctx: ['TraceCorrelation', 'Init'],
      trace_id: sc && sc.traceId ? sc.traceId : null,
      span_id: sc && sc.spanId ? sc.spanId : null,
    });

    logger.info('UI mounted', { ctx: ['UI_Server_flow', 'App'] });

    logger.trace('DOM Content Loaded', { ctx: ['UI', 'Init'] });
    ChartManager.initialize();

    UIManager.init(); // Initialize UIManager and set global reference
    UIManager.applyDefaultSettings(); // Apply default settings from config
    UIManager.setupEventListeners();
    UIManager.reloadData(); // Initial data load
  });
});
