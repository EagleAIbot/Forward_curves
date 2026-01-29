/*!
 * © 2025 Cayman Sunsets Holidays Ltd. All rights reserved.
 *
 * This software and its source code are proprietary and confidential.
 * Unauthorized copying, distribution, or modification of this file, in
 * whole or in part, without the express written permission of
 * Cayman Sunsets Holidays Ltd is strictly prohibited.
 */
import { state, logger } from './state.js';
import { config } from './config.js';
import { CandleDataManager } from './CandleDataManager.js';
import { CurveDataManager } from './CurveDataManager.js';
import { startActiveSpanFromTraceparent } from './tracing.js';

/**
 * Manages WebSocket connections for live trade and forward curve data.
 */
export const WebSocketManager = {

  /**
   * Establishes the WebSocket connection for live data from the server.
   * Sets up event handlers and includes reconnection logic on close.
   */
  startPrediction() {

    if (state.predictionWS && state.predictionWS.readyState === WebSocket.OPEN) {
      return;
    }

    if (state.predictionWS) { // Clean up old socket if exists
      state.predictionWS.onclose = null;
      state.predictionWS.onopen = null;
      state.predictionWS.onmessage = null;
      state.predictionWS.onerror = null;

      try {
        state.predictionWS.close();
      } catch (e) {
        logger.error('Error closing WebSocket', { ctx: ['WebSocket', 'Cleanup'], error: e.message });
      }

      state.predictionWS = null;
    }

    logger.info('Connecting to Forward Curve WebSocket', { ctx: ['WebSocket', 'Connection'], url: config.predictionWsUrl });

    try {
      state.predictionWS = new WebSocket(config.predictionWsUrl);
      window.predictionWS = state.predictionWS;

      state.predictionWS.onopen = () => {
        logger.info('WebSocket connection established', { ctx: ['WebSocket', 'Server', 'Connected'] });
        state.predictionWsConnected = true;
      };

      state.predictionWS.onmessage = async (msg) => {
        try {
          const message = JSON.parse(msg.data);

          if (message.type === 'trade') {
            CandleDataManager.handleTradeMessage(message.data);
          } else if (message.type === 'forward_curve') {
            // Handle V5 forward curve updates
            console.log('[WebSocket] Received V5 forward_curve update:', message.timestamp, message.current_price);
            CurveDataManager.processCurveUpdate(message);
          } else if (message.type === 'v4_forward_curve') {
            // Handle V4 forward curve updates
            console.log('[WebSocket] Received V4 forward_curve update:', message.timestamp, message.current_price);
            CurveDataManager.processV4CurveUpdate(message);
          } else {
            await startActiveSpanFromTraceparent(
              `websocket.${message.type}`,
              async function handleWebSocketMessage() {
                if (message.type === 'heartbeat') {
                  // Server heartbeat - no action needed
                } else if (message.type === 'pong') {
                  // Silent - no logging needed for pong
                } else {
                  logger.trace('Received message type', { type: message.type });
                }
              },
            message.trace_context);
          }
        } catch (e) {
          logger.exception('WebSocket message parsing error', e);
        }
      };

      state.predictionWS.onerror = (err) => {
        logger.error('WebSocket connection error', { error: err });
        state.predictionWsConnected = false;
      };

      state.predictionWS.onclose = (event) => {
        logger.warning('WebSocket connection closed', { code: event.code, reason: event.reason });
        state.predictionWsConnected = false;

        // Implement reconnection logic
        setTimeout(() => this.startPrediction(), config.reconnectDelay || 5000);
      };
    } catch (error) {
      logger.error('Error creating WebSocket', { error: error.message });
      state.predictionWsConnected = false;

      // Try to reconnect after a delay
      setTimeout(() => this.startPrediction(), config.reconnectDelay || 5000);
    }
  },


  /**
   * Closes the WebSocket connection if it exists and prevents automatic reconnection.
   */
   stopPrediction() {
     if (state.predictionWS) {
       logger.info('Stopping WebSocket');

       // Clear all event handlers first
       state.predictionWS.onclose = null;
       state.predictionWS.onopen = null;
       state.predictionWS.onmessage = null;
       state.predictionWS.onerror = null;

       try {
         state.predictionWS.close();
       } catch (e) {
         logger.error('Error closing WebSocket', { error: e.message });
       }

       state.predictionWS = null;
       state.predictionWsConnected = false;
     }
   }
};
