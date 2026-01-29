/*!
 * © 2025 Cayman Sunsets Holidays Ltd. All rights reserved.
 *
 * Forward Curve Data Manager
 * Handles V5 Flash and V4.32 forward curve data from WebSocket.
 */
import { state, logger } from './state.js';
import { config } from './config.js';
import { ChartManager } from './ChartManager.js';

/**
 * Manages forward curve data from V5 Flash and V4.32 APIs.
 */
export const CurveDataManager = {
  /**
   * Current V5 forward curve data
   */
  currentCurve: null,

  /**
   * Current V4 forward curve data
   */
  currentV4Curve: null,

  /**
   * V5 Horizon labels in order
   */
  HORIZONS: ["+1H", "+2H", "+4H", "+6H", "+8H", "+12H", "+18H", "+24H", "+36H", "+48H"],

  /**
   * V4 Horizon labels in order (24H max)
   */
  V4_HORIZONS: ["+1H", "+2H", "+4H", "+6H", "+8H", "+12H", "+18H", "+24H"],

  /**
   * Process incoming forward curve data from WebSocket.
   * @param {Object} curveData - Forward curve data from server
   */
  processCurveUpdate(curveData) {
    if (!curveData || curveData.type !== 'forward_curve') {
      logger.warning('Invalid curve data received', { ctx: ['CurveData'], data: curveData });
      return;
    }

    this.currentCurve = curveData;

    // Update state for UI consumption
    state.forwardCurve = curveData;
    state.curveDirection = curveData.direction;
    state.curveConfidence = curveData.confidence_level;
    state.curveConfidenceScore = curveData.confidence_score;
    state.currentPrice = curveData.current_price;

    // Update chart visualization
    ChartManager.updateForwardCurve(curveData);

    // Dispatch event for UI updates
    this._dispatchCurveUpdate(curveData);

    logger.info('V5 Forward curve updated', {
      ctx: ['CurveData'],
      direction: curveData.direction,
      confidence: curveData.confidence_level,
      price: curveData.current_price,
      horizons: curveData.curve?.length || 0
    });
  },

  /**
   * Process incoming V4 forward curve data from WebSocket.
   * @param {Object} curveData - V4 Forward curve data from server
   */
  processV4CurveUpdate(curveData) {
    if (!curveData || curveData.type !== 'v4_forward_curve') {
      logger.warning('Invalid V4 curve data received', { ctx: ['CurveData'], data: curveData });
      return;
    }

    // Debug: Log anchor_timestamp to verify it's being received
    console.log('[CurveDataManager] V4 curveData:', {
      anchor_timestamp: curveData.anchor_timestamp,
      hours_elapsed: curveData.hours_elapsed,
      curve_length: curveData.curve?.length
    });

    this.currentV4Curve = curveData;

    // Update state for UI consumption
    state.v4ForwardCurve = curveData;
    state.v4CurveDirection = curveData.direction;
    state.v4CurveRegime = curveData.regime;
    state.v4CurveQuality = curveData.curve_quality;
    state.v4CurrentPrice = curveData.current_price;

    // Update chart visualization
    ChartManager.updateV4ForwardCurve(curveData);

    // Dispatch event for UI updates
    this._dispatchV4CurveUpdate(curveData);

    logger.info('V4 Forward curve updated', {
      ctx: ['CurveData'],
      direction: curveData.direction,
      regime: curveData.regime,
      quality: curveData.curve_quality,
      price: curveData.current_price,
      horizons: curveData.curve?.length || 0
    });
  },

  /**
   * Get current V5 curve data.
   * @returns {Object|null}
   */
  getCurrentCurve() {
    return this.currentCurve;
  },

  /**
   * Get current V4 curve data.
   * @returns {Object|null}
   */
  getCurrentV4Curve() {
    return this.currentV4Curve;
  },

  /**
   * Get price target for a specific horizon.
   * @param {string} horizon - Horizon label like "+4H", "+24H"
   * @returns {Object|null} - {target_price, pct_change, lower_90, upper_90}
   */
  getHorizonTarget(horizon) {
    if (!this.currentCurve?.curve) return null;
    return this.currentCurve.curve.find(p => p.horizon === horizon) || null;
  },

  /**
   * Get all curve points for charting.
   * @returns {Array} - Array of {horizon, target_price, pct_change, lower_90, upper_90}
   */
  getCurvePoints() {
    return this.currentCurve?.curve || [];
  },

  /**
   * Get the direction signal (BULLISH/BEARISH/NEUTRAL).
   * @returns {string}
   */
  getDirection() {
    return this.currentCurve?.direction || 'NEUTRAL';
  },

  /**
   * Get confidence level (HIGH/MEDIUM/LOW).
   * @returns {string}
   */
  getConfidenceLevel() {
    return this.currentCurve?.confidence_level || 'LOW';
  },

  /**
   * Get confidence score (0-1).
   * @returns {number}
   */
  getConfidenceScore() {
    return this.currentCurve?.confidence_score || 0;
  },

  /**
   * Dispatch custom event for V5 UI components to listen to.
   * @private
   */
  _dispatchCurveUpdate(curveData) {
    try {
      const event = new CustomEvent('curve:update', {
        detail: curveData,
        bubbles: true
      });
      document.dispatchEvent(event);
    } catch (e) {
      logger.error('Failed to dispatch curve update event', { ctx: ['CurveData'], error: e });
    }
  },

  /**
   * Dispatch custom event for V4 UI components to listen to.
   * @private
   */
  _dispatchV4CurveUpdate(curveData) {
    try {
      const event = new CustomEvent('v4curve:update', {
        detail: curveData,
        bubbles: true
      });
      document.dispatchEvent(event);
    } catch (e) {
      logger.error('Failed to dispatch V4 curve update event', { ctx: ['CurveData'], error: e });
    }
  },

  /**
   * Fetch historical curves from API (for initial load).
   * @param {number} limit - Number of historical curves to fetch
   * @returns {Promise<Array>}
   */
  async fetchHistory(limit = 10) {
    try {
      const response = await fetch(`${config.apiBase}/api/curve/history?limit=${limit}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.predictions || [];
    } catch (e) {
      logger.error('Failed to fetch curve history', { ctx: ['CurveData'], error: e });
      return [];
    }
  },

  /**
   * Fetch current curve from API (fallback if WebSocket not connected).
   * @returns {Promise<Object|null>}
   */
  async fetchCurrent() {
    try {
      const response = await fetch(`${config.apiBase}/api/curve/current`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      this.processCurveUpdate(data);
      return data;
    } catch (e) {
      logger.error('Failed to fetch current curve', { ctx: ['CurveData'], error: e });
      return null;
    }
  },

  /**
   * Reset curve state (for reloading data).
   */
  resetState() {
    // Reset V5 state
    this.currentCurve = null;
    state.forwardCurve = null;
    state.curveDirection = null;
    state.curveConfidence = null;
    state.curveConfidenceScore = null;
    // Reset V4 state
    this.currentV4Curve = null;
    state.v4ForwardCurve = null;
    state.v4CurveDirection = null;
    state.v4CurveRegime = null;
    state.v4CurveQuality = null;
  }
};

