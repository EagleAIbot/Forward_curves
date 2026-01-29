/*!
 * © 2025 Cayman Sunsets Holidays Ltd. All rights reserved.
 *
 * This software and its source code are proprietary and confidential.
 * Unauthorized copying, distribution, or modification of this file, in
 * whole or in part, without the express written permission of
 * Cayman Sunsets Holidays Ltd is strictly prohibited.
 */
import { config } from './config.js';
import { logger } from './state.js';
import { state } from './state.js';
import { ChartManager } from './ChartManager.js';
import { CandleDataManager } from './CandleDataManager.js';
import { CurveDataManager } from './CurveDataManager.js';
import { WebSocketManager } from './WebSocketManager.js';

/**
 * Manages user interface interactions, primarily handling changes in selectors.
 */
export const UIManager = {
  /**
   * Flag to track if WebSockets have been initialized
   */
  webSocketsInitialized: false,

  /**
   * Flag to track if strategy is currently transitioning to prevent race conditions
   */
  _strategyTransitioning: false,

  /**
   * Track the currently selected strategy to detect re-selection
   */
  _currentStrategy: null,

  /**
   * Initialize UIManager and set global reference
   */
  init() {
    // Set global reference for access from other modules
    window.uiManager = this;
  },

  /**
   * Applies default settings from config to UI elements
   */
  applyDefaultSettings() {
    // Set interval selector
    const intervalSelector = document.getElementById('intervalSelector');
    if (intervalSelector) {
      intervalSelector.value = config.uiDefaults.interval.toString();
      // Also update the config value used by the application
      config.currentInterval = config.uiDefaults.interval;
    }

    // Set timeframe selector
    const timeframeSelector = document.getElementById('timeframeSelector');
    if (timeframeSelector) {
      timeframeSelector.value = config.uiDefaults.timeframe;
      // Also update the config value used by the application
      config.predictionTimeframe = config.uiDefaults.timeframe;
    }

    // Set model version selector
    const modelVersionSelector = document.getElementById('modelVersionSelector');
    if (modelVersionSelector) {
      modelVersionSelector.value = config.uiDefaults.version;
      // Also update the config value used by the application
      config.predictionVersion = config.uiDefaults.version;
    }


    // Set timezone selector
    const timezoneSelector = document.getElementById('timezoneSelector');
    if (timezoneSelector) {
      timezoneSelector.value = config.uiDefaults.timeDisplayMode;
      // Also update the state value used by the application
      state.timeDisplayMode = config.uiDefaults.timeDisplayMode;
      // Apply the timezone setting to the chart
    }

    // Set force bar alignment checkbox
    const forceBarAlignmentCheckbox = document.getElementById('forceBarAlignmentCheckbox');
    if (forceBarAlignmentCheckbox) {
      forceBarAlignmentCheckbox.checked = config.uiDefaults.forceBarAlignment;
      // Also update the state value used by the application
      state.forceBarAlignment = config.uiDefaults.forceBarAlignment;
    }

    // Set show predicted line checkbox
    const showPredictedLineCheckbox = document.getElementById('showPredictedLineCheckbox');
    if (showPredictedLineCheckbox) {
      showPredictedLineCheckbox.checked = config.uiDefaults.showPredictedLine;
      // Also update the state value used by the application
      state.showPredictedLine = config.uiDefaults.showPredictedLine;
    }
  },

  /**
   * Sets up event listeners for the interval, timeframe, model version, bar count, timezone selectors,
   * and the load more button. Triggers `reloadData` when a selection changes.
   */
  async initializeStrategySelector() {
    // Strategy selector removed for Forward Curve Hub
  },

  /**
   * Restores the selected strategy from session storage after browser refresh.
   */
  restoreSession() {
    const savedStrategy = sessionStorage.getItem('selectedStrategy');
    if (savedStrategy) {
      const selector = document.getElementById('strategySelector');
      if (selector) {
        selector.value = savedStrategy;
        state.strategyInstanceName = savedStrategy;

        setTimeout(() => {
          const changeEvent = new Event('change');
          selector.dispatchEvent(changeEvent);
        }, 100);
      }
    }
  },

  setupEventListeners() {
    document.getElementById('intervalSelector')?.addEventListener('change', (e) => {
      const newInterval = parseInt(e.target.value);
      if (newInterval !== config.currentInterval) {
        config.currentInterval = newInterval;
        this.reloadData(false); // Pass false to indicate no WebSocket restart needed
      }
    });

    document.getElementById('timeframeSelector')?.addEventListener('change', (e) => {
      const newTimeframe = e.target.value;
      if (newTimeframe !== config.predictionTimeframe) {
        config.predictionTimeframe = newTimeframe;
        this.reloadData(false); // No WebSocket restart needed
      }
    });

    document.getElementById('modelVersionSelector')?.addEventListener('change', (e) => {
      const newVersion = e.target.value;
      if (newVersion !== config.predictionVersion) {
        config.predictionVersion = newVersion;
        this.reloadData(false); // No WebSocket restart needed
      }
    });



    // Add event listener for MAPE window size dropdown
    document.getElementById('mapeWindowSize')?.addEventListener('change', (e) => {
      const windowSize = parseInt(e.target.value, 10);

      if (windowSize !== state.mapeWindowSize) {
        state.mapeWindowSize = windowSize;

        this.recalculateMapeOnly();

      }
    });



    document.getElementById('timezoneSelector')?.addEventListener('change', (e) => {
      const newTimezone = e.target.value;
      if (newTimezone !== state.timeDisplayMode) {
        state.timeDisplayMode = newTimezone;

        // Reload all state when timezone changes, similar to interval switching
        this.reloadData(false);
      }
    });

    // Add event listener for prediction price line checkbox
    document.getElementById('showPredictionPriceLineCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      ChartManager.togglePredictionPriceLine(isChecked);
    });

    // Add event listener for dim candles checkbox
    document.getElementById('dimCandlesCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      ChartManager.toggleCandlestickOpacity(isChecked);
    });

    // Add event listener for force bar alignment checkbox
    document.getElementById('forceBarAlignmentCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      state.forceBarAlignment = isChecked;
      // Reload data to apply the new alignment setting
      this.reloadData(false);
    });

    // Add event listener for Binance price line checkbox
    document.getElementById('showBinancePriceLineCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      ChartManager.toggleBinancePriceLine(isChecked);
    });

    // Add event listener for MAPE checkbox
    document.getElementById('showMapeLowerCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      state.isMapeLowerLineVisible = isChecked;
      ChartManager.toggleMapeLines(isChecked);
    });

    // Add event listener for Show predicted line checkbox
    document.getElementById('showPredictedLineCheckbox')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      state.showPredictedLine = isChecked;
      ChartManager.togglePredictedLine(isChecked);
    });

    // Add event listener for V5 Curve checkbox
    const v5CurveCheckbox = document.getElementById('showV5CurveCheckbox');
    if (v5CurveCheckbox) {
      // Initialize visibility state (default true = checked)
      state.v5CurveVisible = v5CurveCheckbox.checked;
      v5CurveCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        ChartManager.toggleV5Curve(isChecked);
      });
    }

    // Add event listener for V4 Curve checkbox
    const v4CurveCheckbox = document.getElementById('showV4CurveCheckbox');
    if (v4CurveCheckbox) {
      // Initialize visibility state (default true = checked)
      state.v4CurveVisible = v4CurveCheckbox.checked;
      v4CurveCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        ChartManager.toggleV4Curve(isChecked);
      });
    }

    // Add event listener for Show History checkbox (toggle historical candles)
    const showHistoryCheckbox = document.getElementById('showHistoryCheckbox');
    if (showHistoryCheckbox) {
      state.historicalCandlesVisible = showHistoryCheckbox.checked;
      showHistoryCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        ChartManager.toggleHistoricalCandles(isChecked);
      });
    }

    // Add event listener for Smoothed Curve checkbox
    const smoothedCurveCheckbox = document.getElementById('showSmoothedCurveCheckbox');
    if (smoothedCurveCheckbox) {
      state.smoothedCurvesVisible = smoothedCurveCheckbox.checked;
      smoothedCurveCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        ChartManager.toggleSmoothedCurves(isChecked);
      });
    }

    // Add event listener for line shift input
    document.getElementById('lineShiftInput')?.addEventListener('change', (e) => {
      const newShiftMinutes = parseInt(e.target.value);
      if (!isNaN(newShiftMinutes) && newShiftMinutes !== state.lineShiftMinutes) {
        state.lineShiftMinutes = newShiftMinutes;
        ChartManager.refreshClosePriceSeries(); // Refresh the chart with the new shift
      }
    });

    const showClosePriceLineCheckbox = document.getElementById('showClosePriceLineCheckbox');
    if (showClosePriceLineCheckbox) {
      showClosePriceLineCheckbox.checked = state.showClosePriceLine;
      showClosePriceLineCheckbox.addEventListener('change', (e) => {
        state.showClosePriceLine = e.target.checked;
        ChartManager.toggleClosePriceLineVisibility(state.showClosePriceLine);
      });
    }

    // Initialize force bar alignment checkbox
    const forceBarAlignmentCheckbox = document.getElementById('forceBarAlignmentCheckbox');
    if (forceBarAlignmentCheckbox) {
      forceBarAlignmentCheckbox.checked = state.forceBarAlignment;
    }

    // Add event listener for Use Standard Predictions checkbox
    document.getElementById('useStandardPredictionsCheckbox')?.addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      state.useStandardPredictions = isChecked;

      // Send setting to server
      try {
        const response = await fetch(`${config.localApiBase}/set-prediction-mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useStandard: isChecked })
        });
        if (response.ok) {
          logger.info(`Prediction mode set to: ${isChecked ? 'Standard' : 'Enriched'}`);
          // Reload data to get predictions in new format
          this.reloadData(false);
        }
      } catch (err) {
        logger.error('Failed to set prediction mode', { error: err.message });
      }
    });

    // Add event listener for verbose tooltip checkbox
    document.getElementById('verboseTooltipCheckbox')?.addEventListener('change', (e) => {
      state.verboseTooltip = e.target.checked;
    });

    // Add event listener for the Load More button
    const loadMoreButton = document.getElementById('loadMoreButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadMoreButton && loadingIndicator) {
      loadMoreButton.addEventListener('click', async () => {
        try {
          // Show loading indicator and disable the button
          loadingIndicator.style.display = 'block';
          loadMoreButton.disabled = true;

          // Load more historical candles
          const success = await CandleDataManager.loadMoreCandles();

          if (success) {
            // Fit the chart to show all the new content
            if (window.chart && window.chart.timeScale) {
              window.chart.timeScale().fitContent();
            }
          }

        } catch (err) {
          logger.error("Error loading more historical data", { ctx: ['UI', 'LoadMore'], error: err.message });
        } finally {
          // Hide loading indicator and re-enable button
          loadingIndicator.style.display = 'none';
          loadMoreButton.disabled = false;
        }
      });
    }
    // Initialize WebSockets once at startup if not already done
    if (!this.webSocketsInitialized) {
      WebSocketManager.startPrediction();
      this.webSocketsInitialized = true;
    }

    // Restore session after all event listeners are set up
    this.restoreSession();
  },

  /**
   * Orchestrates the process of reloading all data in proper sequence.
   * Ensures each layer completes before the next begins to prevent rendering race conditions.
   * Optionally stops/restarts WebSockets based on restartSockets parameter.
   *
   * @param {boolean} restartSockets - Whether to restart WebSockets (default: false)
   */
  async reloadData(restartSockets = false) {
    // Only stop WebSockets if explicitly requested
    if (restartSockets) {
      WebSocketManager.stopPrediction();
    }

    // Clear chart series and state
    ChartManager.resetSeriesData();
    CandleDataManager.resetState();
    CurveDataManager.resetState();

    // Clear markers
    state.seriesMarkers = [];
    state.strategyEventMarkers = [];
    if (state.candleSeries) {
      state.markersAPI?.setMarkers([]);
    }

    // Load candles (base coordinate system)
    const { lastCandleTime } = await CandleDataManager.fetchHistorical();

    const candleData = state.candleSeries?.data() ?? [];
    const firstCandleTime = candleData.length > 0 ? candleData[0].time : null;

    if (!firstCandleTime || !lastCandleTime) {
      logger.debug("No candle data available", { ctx: ['UI', 'Reload'] });
      return;
    }

    // Restart WebSockets if they were stopped
    if (restartSockets) {
      WebSocketManager.startPrediction();
      this.webSocketsInitialized = true;
    }
  }
};
