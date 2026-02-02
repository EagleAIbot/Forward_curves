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
import { shiftDataToLocalTime, parseTimeToSecondsUTC, toRFC3339FromSeconds, shiftPointToLocalTime, unshiftTimeStampToUtc, shiftTimeStampToLocal } from './utils.js';
/**
 * Manages the Lightweight Charts instance and its series.
 */
export const ChartManager = {
  /**
   * Initializes the Lightweight Chart, adds all required series, and configures basic settings.
   */
  initialize() {
    // Destructure all necessary components from the global LightweightCharts object
    const {
      createChart,
      CrosshairMode,
      LineStyle,
      LineSeries,
      CandlestickSeries,
      TickMarkType: ImportedTickMarkType,
    } = window.LightweightCharts;

    // Fallback mapping for UMD build
    const TickMarkType = ImportedTickMarkType ?? {
      Year:            0,  // start of each year
      Month:           1,  // start of each calendar month
      DayOfMonth:      2,  // when the day rolls over
      Time:            3,  // intraday (hours+minutes)
      TimeWithSeconds: 4,  // intraday including seconds
    };

    const chartElement = document.getElementById('chart');

    if (!chartElement) {
      logger.error('Chart element not found!', { ctx: ['Chart', 'Init'] });
      return;
    }

    state.chart = createChart(chartElement, {
      layout: {
        background: { type: 'solid', color: '#000' },
        textColor: '#ccc'
      },
      grid: {
        vertLines: { color: '#333' },
        horzLines: { color: '#333' }
      },
      rightPriceScale: {
        borderColor: '#555'
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          labelVisible: false,
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 20,  // Leave space on right for forward curve future points
        shiftVisibleRangeOnNewBar: true,

        tickMarkFormatter: (time, tickMarkType, locale) => {

          const date = new Date(time * 1000);

          // Determine timezone based on current display mode
          let timeZone = 'UTC';
          if (state.timeDisplayMode === 'Local') {
            timeZone = undefined; // Use browser's local timezone
          } else if (state.timeDisplayMode === 'NY') {
            timeZone = 'America/New_York';
          }

          // Build format options, conditionally including timeZone
          const getOptions = (baseOptions) => {
            if (timeZone === undefined) {
              return baseOptions; // Omit timeZone to use browser local time
            }
            return { ...baseOptions, timeZone };
          };

          switch (tickMarkType) {
            case TickMarkType.DayOfMonth:
              return new Intl.DateTimeFormat(locale, getOptions({ day: '2-digit', month: 'short' })).format(date);
            case TickMarkType.Month:
              return new Intl.DateTimeFormat(locale, getOptions({ day: '2-digit', month: 'short' })).format(date);
            case TickMarkType.Year:
              return new Intl.DateTimeFormat(locale, getOptions({ day: '2-digit', month: 'short', year: 'numeric' })).format(date);
            case TickMarkType.Time:
            default:
              return new Intl.DateTimeFormat(locale, getOptions({ hour: '2-digit', minute: '2-digit', hour12: false })).format(date);
          }
        },
      },
    });

    // V5 UPGRADE: Use the new addSeries API
    state.candleSeries = state.chart.addSeries(CandlestickSeries, {});

    state.candleSeries.applyOptions({
      upColor:        'rgba(38,166,154,0.6)',   // softer teal-green
      downColor:      'rgba(239,83,80,0.6)',    // softer soft-red
      borderUpColor:  'rgba(38,166,154,1)',     // solid border
      borderDownColor:'rgba(239,83,80,1)',
      wickUpColor:    'rgba(38,166,154,1)',
      wickDownColor:  'rgba(239,83,80,1)',
      borderVisible: true,
      visible: state.historicalCandlesVisible  // Hidden by default (false)
    });

    this.createTooltipElement();
    this.createTimeLabel();

    // V5 UPGRADE: Use the new addSeries API.
    // NOTE: pointMarkersVisible is no longer a valid option. Markers are now a plugin.
    // You will need to add the Series Marker plugin to restore this functionality.
    // Old prediction dots - hidden by default (forward curve replaces this)
    state.predictedDots = state.chart.addSeries(LineSeries, {
      color: config.chartColors.predictedDots,
      lineWidth: 1,
      lineVisible: false,
      crossHairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,         // hidden - forward curve replaces this
      pointMarkersRadius: 1,
      visible: false,
    });

    // V5 UPGRADE: Use the new addSeries API and note that markers are now a plugin.
    state.predictionPriceLine = state.chart.addSeries(LineSeries, {
      color: config.chartColors.predictionPriceLine,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });

    // V5 UPGRADE: Use the new addSeries API and note that markers are now a plugin.
    state.binancePriceLine = state.chart.addSeries(LineSeries, {
      color: config.chartColors.binancePricePredictedPoints,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
      pointMarkersRadius: 1,             // optional: size of the dots
    });

    // V5 UPGRADE: Use the new addSeries API
    state.mapeLowerLine = state.chart.addSeries(LineSeries, {
      color: config.chartColors.mapeCalcLine,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });

    // V5 UPGRADE: Use the new addSeries API
    state.mapeUpperLine = state.chart.addSeries(LineSeries, {
      color: config.chartColors.mapeCalcLine,
      lineStyle: LineStyle.Dashed,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: false,
    });

    // Blue dot hover series - hidden by default (forward curve replaces this)
    state.blueDotSeries = state.chart.addSeries(LineSeries, {
      color: config.chartColors.blueDotSeries,
      lineVisible: false,
      crossHairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,  // hidden - forward curve replaces this
      pointMarkersRadius: 5,
      visible: false,
    });

    // state.timeLabel = document.getElementById('custom-time-label');
    state.chart.subscribeCrosshairMove(this.handleCrosshairMove.bind(this));

    // V5 UPGRADE: Use the new addSeries API
    state.closePriceSeries = state.chart.addSeries(LineSeries, {
      color: config.chartColors.closePriceSeries,
      lineWidth: 1,
      lastValueVisible: false,
      priceLineVisible: false,
      visible: state.showClosePriceLine,
    });

    // Forward Curve Series - thin line for predictions
    state.forwardCurveSeries = state.chart.addSeries(LineSeries, {
      color: '#4CAF50',  // Green (will be overridden by direction)
      lineWidth: 1,      // Thin line
      lineVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
      pointMarkersVisible: false,  // No dots on the interpolated line
    });

    // Forward Curve Horizon Markers - circles at each horizon point (+1H, +2H, etc.)
    state.forwardCurveMarkers = state.chart.addSeries(LineSeries, {
      color: '#FFFFFF',  // White circles
      lineWidth: 0,      // No line
      lineVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,  // Circle size
    });

    // Forward Curve Upper Confidence Band (90%) - thin dashed line
    state.forwardCurveUpperBand = state.chart.addSeries(LineSeries, {
      color: 'rgba(76, 175, 80, 0.4)',  // Semi-transparent green
      lineWidth: 1,
      lineVisible: true,
      lineStyle: 2,  // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // Forward Curve Lower Confidence Band (90%) - thin dashed line
    state.forwardCurveLowerBand = state.chart.addSeries(LineSeries, {
      color: 'rgba(244, 67, 54, 0.4)',  // Semi-transparent red
      lineWidth: 1,
      lineVisible: true,
      lineStyle: 2,  // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // ============================================
    // V4.32 FORWARD CURVE SERIES (Cyan)
    // ============================================

    // V4 Forward Curve Series - cyan line
    state.v4ForwardCurveSeries = state.chart.addSeries(LineSeries, {
      color: '#22d3ee',  // Cyan
      lineWidth: 1,
      lineVisible: true,
      lastValueVisible: true,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // V4 Forward Curve Horizon Markers - cyan circles
    state.v4ForwardCurveMarkers = state.chart.addSeries(LineSeries, {
      color: '#22d3ee',  // Cyan
      lineWidth: 0,
      lineVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
    });

    // V4 Forward Curve Upper Confidence Band (90%)
    state.v4ForwardCurveUpperBand = state.chart.addSeries(LineSeries, {
      color: 'rgba(34, 211, 238, 0.3)',  // Semi-transparent cyan
      lineWidth: 1,
      lineVisible: true,
      lineStyle: 2,  // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // V4 Forward Curve Lower Confidence Band (90%)
    state.v4ForwardCurveLowerBand = state.chart.addSeries(LineSeries, {
      color: 'rgba(34, 211, 238, 0.3)',  // Semi-transparent cyan
      lineWidth: 1,
      lineVisible: true,
      lineStyle: 2,  // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // V4 Original Predictions Line - dashed cyan showing what model predicted at anchor time
    state.v4OriginalPredictionLine = state.chart.addSeries(LineSeries, {
      color: 'rgba(34, 211, 238, 0.6)',  // Semi-transparent cyan
      lineWidth: 1,
      lineVisible: true,
      lineStyle: 2,  // Dashed
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
    });

    // V4 Original Predictions Markers - small cyan circles on dashed line
    state.v4OriginalPredictionMarkers = state.chart.addSeries(LineSeries, {
      color: 'rgba(34, 211, 238, 0.6)',  // Semi-transparent cyan
      lineWidth: 0,
      lineVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: true,
      pointMarkersRadius: 3,
    });

    // ============================================
    // SMOOTHED FORWARD CURVE SERIES
    // ============================================

    // V5 Smoothed Forward Curve - thicker yellow dashed line overlay
    state.v5SmoothedCurveSeries = state.chart.addSeries(LineSeries, {
      color: '#FFD700',  // Gold/Yellow - distinct from green V5 curve
      lineWidth: 3,
      lineStyle: 2,  // Dashed line (0=solid, 1=dotted, 2=dashed)
      lineVisible: true,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
      visible: false,  // Hidden by default
    });

    // V4 Smoothed Forward Curve - thicker magenta dashed line overlay
    state.v4SmoothedCurveSeries = state.chart.addSeries(LineSeries, {
      color: '#FF69B4',  // Hot Pink/Magenta - distinct from cyan V4 curve
      lineWidth: 3,
      lineStyle: 2,  // Dashed line
      lineVisible: true,
      lastValueVisible: false,
      priceLineVisible: false,
      pointMarkersVisible: false,
      visible: false,  // Hidden by default
    });

    window.chart = state.chart;
    try {
      // Notify other parts of the UI that the chart instance is ready
      const evt = new CustomEvent('chart:ready', { detail: { chart: state.chart } });
      document.dispatchEvent(evt);
    } catch (e) {
      // Fallback for environments without CustomEvent
      try { document.dispatchEvent(new Event('chart:ready')); } catch {}
    }

    state.markersAPI = window.LightweightCharts.createSeriesMarkers(state.candleSeries, state.seriesMarkers);

    // ============================================
    // SPOT POSITION TRACKING (for spot market display)
    // ============================================

    // Function to update NOW position and dispatch event
    const updateSpotPosition = () => {
      if (!state.chart) return;
      // Use current timestamp (in seconds), aligned to current hour (like Oracle does)
      const nowHourTs = Math.floor(Date.now() / 1000 / 3600) * 3600;
      // Apply local time shift to match how candles are displayed
      const shiftedNowTs = shiftTimeStampToLocal(nowHourTs);
      const coordinate = state.chart.timeScale().timeToCoordinate(shiftedNowTs);

      // Debug logging
      console.log('[SpotPosition] nowHourTs:', nowHourTs, 'shiftedNowTs:', shiftedNowTs, 'coordinate:', coordinate);

      // Dispatch custom event with position
      document.dispatchEvent(new CustomEvent('spotposition:update', {
        detail: { x: coordinate, timestamp: nowHourTs }
      }));
    };

    // Subscribe to time scale changes (pan/zoom)
    state.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      updateSpotPosition();
    });

    // Also update on resize
    const resizeObserver = new ResizeObserver(() => {
      setTimeout(updateSpotPosition, 50);
    });
    const chartEl = document.getElementById('chart');
    if (chartEl) {
      resizeObserver.observe(chartEl);
    }

    // Initial position update after chart settles
    setTimeout(updateSpotPosition, 100);

  },

  /**
   * Clears all data from all chart series and resets prediction markers.
   */
  resetSeriesData() {
    state.candleSeries?.setData([]);
    state.predictedDots?.setData([]);
    state.closePriceSeries?.setData([]);
    state.binancePriceLine?.setData([]);
    // V5 curves
    state.forwardCurveSeries?.setData([]);
    state.forwardCurveUpperBand?.setData([]);
    state.forwardCurveLowerBand?.setData([]);
    // V4 curves
    state.v4ForwardCurveSeries?.setData([]);
    state.v4ForwardCurveMarkers?.setData([]);
    state.v4ForwardCurveUpperBand?.setData([]);
    state.v4ForwardCurveLowerBand?.setData([]);
    state.v4OriginalPredictionLine?.setData([]);
    state.v4OriginalPredictionMarkers?.setData([]);
  },

  /**
   * Updates the forward curve visualization on the chart.
   * Uses hour-aligned timestamps like V4 Oracle for proper spacing.
   * @param {Object} curveData - Forward curve data from V5 API
   */
  updateForwardCurve(curveData) {
    if (!curveData || !curveData.curve || !Array.isArray(curveData.curve)) {
      return;
    }

    // Store curve data for re-rendering with different interpolation methods
    state.lastV5CurveData = curveData;

    // Use hour-aligned timestamp (like V4 Oracle)
    const now = Math.floor(Date.now() / 1000);
    const nowHour = Math.floor(now / 3600) * 3600;

    // Map horizon labels to hours
    const horizonToHours = {
      '+1H': 1, '+2H': 2, '+4H': 4, '+6H': 6, '+8H': 8,
      '+12H': 12, '+18H': 18, '+24H': 24, '+36H': 36, '+48H': 48
    };

    // Build curve points with 5-minute intervals (interpolated)
    const curvePoints = [];
    const upperBandPoints = [];
    const lowerBandPoints = [];
    const horizonMarkerPoints = [];  // Circle markers at each horizon

    // Build raw horizon points first (for interpolation)
    const rawPoints = [];
    // Store horizon data for tooltips
    state.forwardCurveHorizonData = {};

    for (const point of curveData.curve) {
      const hours = horizonToHours[point.horizon];
      if (hours === undefined) continue;

      const futureTime = nowHour + (hours * 3600);
      const shiftedTime = shiftTimeStampToLocal(futureTime);
      const currentPrice = curveData.current_price || point.target_price;

      rawPoints.push({
        time: futureTime,
        value: point.target_price,
        upper: point.upper_90 !== undefined ? currentPrice * (1 + point.upper_90 / 100) : null,
        lower: point.lower_90 !== undefined ? currentPrice * (1 + point.lower_90 / 100) : null
      });

      // Add horizon marker point
      horizonMarkerPoints.push({
        time: shiftedTime,
        value: point.target_price
      });

      // Store horizon data for tooltip lookup
      state.forwardCurveHorizonData[shiftedTime] = {
        horizon: point.horizon,
        target_price: point.target_price,
        pct_change: point.pct_change,
        lower_90: point.lower_90,
        upper_90: point.upper_90,
        current_price: currentPrice
      };
    }

    // Sort by time
    rawPoints.sort((a, b) => a.time - b.time);

    // Add current price as starting point for interpolation
    const allPoints = [{
      time: nowHour,
      value: curveData.current_price,
      upper: curveData.current_price,
      lower: curveData.current_price
    }, ...rawPoints];

    // Interpolate to 5-minute intervals using selected method
    const INTERVAL = 300; // 5 minutes in seconds
    const method = this.getCurrentInterpolationMethod();

    // Prepare separate arrays for main, upper, and lower
    const mainPoints = allPoints.map(p => ({ time: p.time, value: p.value }));
    const upperPoints = allPoints.filter(p => p.upper !== null).map(p => ({ time: p.time, value: p.upper }));
    const lowerPoints = allPoints.filter(p => p.lower !== null).map(p => ({ time: p.time, value: p.lower }));

    // Apply selected interpolation method
    const interpolatedMain = this.interpolateCurve(mainPoints, INTERVAL, method);
    const interpolatedUpper = this.interpolateCurve(upperPoints, INTERVAL, method);
    const interpolatedLower = this.interpolateCurve(lowerPoints, INTERVAL, method);

    // Apply timezone shift to all points
    for (const p of interpolatedMain) {
      curvePoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }
    for (const p of interpolatedUpper) {
      upperBandPoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }
    for (const p of interpolatedLower) {
      lowerBandPoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }

    // Update the series with interpolated data
    state.forwardCurveSeries?.setData(curvePoints);
    state.forwardCurveUpperBand?.setData(upperBandPoints);
    state.forwardCurveLowerBand?.setData(lowerBandPoints);

    // Update horizon markers (circles at each horizon point)
    state.forwardCurveMarkers?.setData(horizonMarkerPoints);

    // Store curve points for later smoothing toggle
    state.lastV5CurvePoints = curvePoints;

    // Update smoothed curve (if visible)
    if (state.smoothedCurvesVisible && curvePoints.length > 0) {
      const smoothedPoints = this.smoothCurveData(curvePoints);
      state.v5SmoothedCurveSeries?.setData(smoothedPoints);
    }

    // Update curve color based on direction
    const curveColor = curveData.direction === 'BULLISH' ? '#4CAF50' :
                       curveData.direction === 'BEARISH' ? '#F44336' : '#2196F3';
    state.forwardCurveSeries?.applyOptions({ color: curveColor });

    // Update marker color to match curve
    state.forwardCurveMarkers?.applyOptions({ color: curveColor });

    // Store last updated time
    state.forwardCurveLastUpdated = curveData.timestamp || new Date().toISOString();

    // Update the "Last Updated" display
    this.updateLastUpdatedDisplay();

    // Fit content to show the full curve (don't jump around too much)
    // Only fit if this is the first curve update
    if (!state._curveInitialized) {
      state.chart?.timeScale().fitContent();
      state._curveInitialized = true;
    }
  },

  /**
   * Updates the V4.32 forward curve visualization on the chart.
   * V4 has horizons: 1H, 2H, 4H, 6H, 8H, 12H, 18H, 24H
   * V4 anchors at 13:00 UTC daily - horizons are relative to anchor_timestamp
   * @param {Object} curveData - Forward curve data from V4 API
   */
  updateV4ForwardCurve(curveData) {
    if (!curveData || !curveData.curve || !Array.isArray(curveData.curve)) {
      return;
    }

    // Store curve data for re-rendering with different interpolation methods
    state.lastV4CurveData = curveData;

    // Use anchor_timestamp from API (13:00 UTC) as base for horizons
    // This is when the prediction was made - all horizons are relative to this
    let anchorTime;
    if (curveData.anchor_timestamp) {
      // Parse anchor timestamp (e.g., "2026-01-28T13:00:00")
      // Add 'Z' suffix if not present to ensure UTC parsing
      let anchorStr = curveData.anchor_timestamp;
      if (!anchorStr.endsWith('Z') && !anchorStr.includes('+')) {
        anchorStr += 'Z';
      }
      anchorTime = Math.floor(new Date(anchorStr).getTime() / 1000);
      console.log('[V4 Curve] Anchor timestamp:', curveData.anchor_timestamp, '-> anchorTime:', anchorTime, '-> Date:', new Date(anchorTime * 1000).toISOString());
    } else {
      // Fallback to current hour if no anchor
      const now = Math.floor(Date.now() / 1000);
      anchorTime = Math.floor(now / 3600) * 3600;
      console.log('[V4 Curve] No anchor_timestamp, using nowHour:', anchorTime);
    }

    // Map V4 horizon labels to hours
    const horizonToHours = {
      '+1H': 1, '+2H': 2, '+4H': 4, '+6H': 6, '+8H': 8,
      '+12H': 12, '+18H': 18, '+24H': 24
    };

    // Build curve points with 5-minute intervals (interpolated)
    const curvePoints = [];
    const upperBandPoints = [];
    const lowerBandPoints = [];
    const horizonMarkerPoints = [];

    // Build raw horizon points first (for interpolation)
    const rawPoints = [];
    // Store horizon data for tooltips
    state.v4ForwardCurveHorizonData = {};

    // Use anchor_price (price at anchor time) as reference for confidence bands
    const anchorPrice = curveData.anchor_price || curveData.current_price;

    console.log('[V4 Curve] Building curve with', curveData.curve.length, 'points');

    for (const point of curveData.curve) {
      const hours = horizonToHours[point.horizon];
      if (hours === undefined) continue;

      // Calculate time relative to anchor, not current time
      const futureTime = anchorTime + (hours * 3600);
      const shiftedTime = shiftTimeStampToLocal(futureTime);

      console.log(`[V4 Curve] ${point.horizon}: futureTime=${futureTime} (${new Date(futureTime * 1000).toISOString()}), is_actual=${point.is_actual}`);

      rawPoints.push({
        time: futureTime,
        value: point.target_price,
        upper: point.upper_90 !== undefined ? anchorPrice * (1 + point.upper_90 / 100) : null,
        lower: point.lower_90 !== undefined ? anchorPrice * (1 + point.lower_90 / 100) : null,
        is_actual: point.is_actual
      });

      // Add horizon marker point
      horizonMarkerPoints.push({
        time: shiftedTime,
        value: point.target_price
      });

      // Store horizon data for tooltip lookup
      state.v4ForwardCurveHorizonData[shiftedTime] = {
        horizon: point.horizon,
        target_price: point.target_price,
        pct_change: point.pct_change,
        lower_90: point.lower_90,
        upper_90: point.upper_90,
        current_price: anchorPrice,
        is_actual: point.is_actual
      };
    }

    // Sort by time
    rawPoints.sort((a, b) => a.time - b.time);

    // Add anchor price as starting point for interpolation (at anchor time)
    const allPoints = [{
      time: anchorTime,
      value: anchorPrice,
      upper: anchorPrice,
      lower: anchorPrice
    }, ...rawPoints];

    // Interpolate to 5-minute intervals using selected method
    const INTERVAL = 300; // 5 minutes in seconds
    const method = this.getCurrentInterpolationMethod();

    // Prepare separate arrays for main, upper, and lower
    const mainPoints = allPoints.map(p => ({ time: p.time, value: p.value }));
    const upperPoints = allPoints.filter(p => p.upper !== null).map(p => ({ time: p.time, value: p.upper }));
    const lowerPoints = allPoints.filter(p => p.lower !== null).map(p => ({ time: p.time, value: p.lower }));

    // Apply selected interpolation method
    const interpolatedMain = this.interpolateCurve(mainPoints, INTERVAL, method);
    const interpolatedUpper = this.interpolateCurve(upperPoints, INTERVAL, method);
    const interpolatedLower = this.interpolateCurve(lowerPoints, INTERVAL, method);

    // Apply timezone shift to all points
    for (const p of interpolatedMain) {
      curvePoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }
    for (const p of interpolatedUpper) {
      upperBandPoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }
    for (const p of interpolatedLower) {
      lowerBandPoints.push({ time: shiftTimeStampToLocal(p.time), value: p.value });
    }

    // Update the V4 series with interpolated data
    state.v4ForwardCurveSeries?.setData(curvePoints);
    state.v4ForwardCurveUpperBand?.setData(upperBandPoints);
    state.v4ForwardCurveLowerBand?.setData(lowerBandPoints);

    // Store curve points for later smoothing toggle
    state.lastV4CurvePoints = curvePoints;

    // Update smoothed curve (if visible)
    if (state.smoothedCurvesVisible && curvePoints.length > 0) {
      const smoothedPoints = this.smoothCurveData(curvePoints);
      state.v4SmoothedCurveSeries?.setData(smoothedPoints);
    }

    // Build original predictions dashed line (what model predicted at anchor time)
    // This shows the original forecast before actuals came in
    const originalPredictionPoints = [];
    const originalMarkerPoints = [];

    // Start from anchor price at anchor time
    const origRawPoints = [{
      time: anchorTime,
      value: anchorPrice
    }];

    for (const point of curveData.curve) {
      const hours = horizonToHours[point.horizon];
      if (hours === undefined) continue;

      // Only include points that have original_price (the original prediction)
      if (point.original_price !== undefined && point.original_price !== null) {
        const futureTime = anchorTime + (hours * 3600);
        origRawPoints.push({
          time: futureTime,
          value: point.original_price
        });
      }
    }

    // Sort by time
    origRawPoints.sort((a, b) => a.time - b.time);

    // Interpolate original predictions to 5-minute intervals
    const ORIG_INTERVAL = 300;
    for (let i = 0; i < origRawPoints.length - 1; i++) {
      const p1 = origRawPoints[i];
      const p2 = origRawPoints[i + 1];

      for (let t = p1.time; t < p2.time; t += ORIG_INTERVAL) {
        const factor = (t - p1.time) / (p2.time - p1.time);
        const shiftedTime = shiftTimeStampToLocal(t);
        originalPredictionPoints.push({
          time: shiftedTime,
          value: p1.value + (p2.value - p1.value) * factor
        });
      }
    }

    // Add final point
    if (origRawPoints.length > 0) {
      const lastPoint = origRawPoints[origRawPoints.length - 1];
      originalPredictionPoints.push({
        time: shiftTimeStampToLocal(lastPoint.time),
        value: lastPoint.value
      });
    }

    // Build original prediction markers (small circles on dashed line)
    for (const point of curveData.curve) {
      const hours = horizonToHours[point.horizon];
      if (hours === undefined) continue;

      if (point.original_price !== undefined && point.original_price !== null) {
        const futureTime = anchorTime + (hours * 3600);
        originalMarkerPoints.push({
          time: shiftTimeStampToLocal(futureTime),
          value: point.original_price
        });
      }
    }

    state.v4OriginalPredictionLine?.setData(originalPredictionPoints);
    state.v4OriginalPredictionMarkers?.setData(originalMarkerPoints);

    // Build markers with actual/prediction distinction like Oracle
    // Actuals = green with ✓, Predictions = cyan
    const markerData = [];

    // Add anchor marker at anchor time
    const anchorShiftedTime = shiftTimeStampToLocal(anchorTime);
    markerData.push({
      time: anchorShiftedTime,
      value: anchorPrice
    });

    // Add horizon markers with actual/prediction colors
    for (const point of curveData.curve) {
      const hours = horizonToHours[point.horizon];
      if (hours === undefined) continue;

      const futureTime = anchorTime + (hours * 3600);
      const shiftedTime = shiftTimeStampToLocal(futureTime);

      markerData.push({
        time: shiftedTime,
        value: point.target_price
      });
    }

    state.v4ForwardCurveMarkers?.setData(markerData);

    // Store anchor info for display
    state.v4AnchorTimestamp = curveData.anchor_timestamp;
    state.v4HoursElapsed = curveData.hours_elapsed || 0;

    // Store last updated time
    state.v4ForwardCurveLastUpdated = curveData.timestamp || new Date().toISOString();

    // Update the V4 panel display
    this.updateV4LastUpdatedDisplay();
  },

  /**
   * Update the "Last Updated" display in the UI with all horizon predictions
   */
  updateLastUpdatedDisplay() {
    let panelEl = document.getElementById('forward-curve-panel');
    if (!panelEl) {
      // Create the panel if it doesn't exist
      panelEl = document.createElement('div');
      panelEl.id = 'forward-curve-panel';
      panelEl.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.85);
        color: #ccc;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 10px;
        font-family: monospace;
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
        min-width: 200px;
        cursor: move;
      `;
      document.getElementById('chart')?.appendChild(panelEl);
      this.makeDraggable(panelEl);
    }

    // Respect visibility state from toggle
    if (state.v5BoxVisible === false) {
      panelEl.style.display = 'none';
    }

    if (!state.forwardCurveLastUpdated || !state.forwardCurveHorizonData) {
      return;
    }

    const date = new Date(state.forwardCurveLastUpdated);
    const timeStr = date.toLocaleTimeString();

    // Build the panel HTML
    let html = `<div style="color: #fff; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #444; padding-bottom: 4px;">
      Curve Updated: ${timeStr}
    </div>`;

    // Get previous predictions for comparison
    const prevData = state.forwardCurvePreviousData || {};

    // Sort horizons by hours
    const horizonOrder = ['+1H', '+2H', '+4H', '+6H', '+8H', '+12H', '+18H', '+24H', '+36H', '+48H'];

    html += `<div style="display: grid; grid-template-columns: auto auto auto; gap: 2px 8px; font-size: 9px;">`;
    html += `<div style="color: #888;">Horizon</div><div style="color: #888;">Price</div><div style="color: #888;">Chg</div>`;

    for (const horizon of horizonOrder) {
      // Find the data for this horizon
      const horizonEntry = Object.values(state.forwardCurveHorizonData).find(h => h.horizon === horizon);
      if (!horizonEntry) continue;

      const price = horizonEntry.target_price;
      const pctChange = horizonEntry.pct_change || 0;
      const pctColor = pctChange >= 0 ? '#4CAF50' : '#F44336';

      // Check if price changed from previous update
      const prevPrice = prevData[horizon]?.target_price;
      let changeIndicator = '';
      if (prevPrice !== undefined && prevPrice !== price) {
        const diff = price - prevPrice;
        const diffColor = diff >= 0 ? '#4CAF50' : '#F44336';
        const arrow = diff >= 0 ? '↑' : '↓';
        changeIndicator = `<span style="color: ${diffColor}; font-size: 8px;"> ${arrow}${Math.abs(diff).toFixed(0)}</span>`;
      }

      html += `<div style="color: #aaa;">${horizon}</div>`;
      html += `<div>$${price?.toLocaleString()}${changeIndicator}</div>`;
      html += `<div style="color: ${pctColor};">${pctChange >= 0 ? '+' : ''}${pctChange?.toFixed(2)}%</div>`;
    }

    html += `</div>`;

    panelEl.innerHTML = html;

    // Store current data as previous for next comparison
    state.forwardCurvePreviousData = {};
    for (const [time, data] of Object.entries(state.forwardCurveHorizonData)) {
      state.forwardCurvePreviousData[data.horizon] = { ...data };
    }
  },

  /**
   * Update the V4 "Last Updated" display in the UI with all horizon predictions
   */
  updateV4LastUpdatedDisplay() {
    let panelEl = document.getElementById('v4-forward-curve-panel');
    if (!panelEl) {
      // Create the panel if it doesn't exist
      panelEl = document.createElement('div');
      panelEl.id = 'v4-forward-curve-panel';
      panelEl.style.cssText = `
        position: absolute;
        top: 10px;
        right: 230px;
        background: rgba(0, 20, 30, 0.9);
        color: #22d3ee;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 10px;
        font-family: monospace;
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
        min-width: 200px;
        border: 1px solid rgba(34, 211, 238, 0.3);
        cursor: move;
      `;
      document.getElementById('chart')?.appendChild(panelEl);
      this.makeDraggable(panelEl);
    }

    // Respect visibility state from toggle
    if (state.v4BoxVisible === false) {
      panelEl.style.display = 'none';
    }

    if (!state.v4ForwardCurveLastUpdated || !state.v4ForwardCurveHorizonData) {
      return;
    }

    const date = new Date(state.v4ForwardCurveLastUpdated);
    const timeStr = date.toLocaleTimeString();

    // Format anchor timestamp for display
    let anchorStr = '';
    if (state.v4AnchorTimestamp) {
      const anchorDate = new Date(state.v4AnchorTimestamp + 'Z');
      anchorStr = anchorDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
    }
    const hoursElapsed = state.v4HoursElapsed || 0;

    // Build the panel HTML
    let html = `<div style="color: #22d3ee; font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(34, 211, 238, 0.3); padding-bottom: 4px;">
      V4.32 Updated: ${timeStr}
    </div>`;

    // Show liquidity fixing info
    if (anchorStr) {
      html += `<div style="color: #10b981; font-size: 9px; margin-bottom: 6px;">
        🔒 Liq Fix: ${anchorStr} (${hoursElapsed}h elapsed)
      </div>`;
    }

    // Get previous predictions for comparison
    const prevData = state.v4ForwardCurvePreviousData || {};

    // Sort horizons by hours
    const horizonOrder = ['+1H', '+2H', '+4H', '+6H', '+8H', '+12H', '+18H', '+24H'];

    html += `<div style="display: grid; grid-template-columns: auto auto auto; gap: 2px 8px; font-size: 9px;">`;
    html += `<div style="font-weight: bold; color: #888;">Horizon</div>`;
    html += `<div style="font-weight: bold; color: #888;">Price</div>`;
    html += `<div style="font-weight: bold; color: #888;">Chg</div>`;

    for (const horizon of horizonOrder) {
      const horizonData = Object.values(state.v4ForwardCurveHorizonData).find(d => d.horizon === horizon);
      if (!horizonData) continue;

      const price = horizonData.target_price;
      const pctChange = horizonData.pct_change;
      const pctColor = pctChange >= 0 ? '#4CAF50' : '#F44336';
      const isActual = horizonData.is_actual;

      // Check for price change from previous update
      let changeIndicator = '';
      const prev = prevData[horizon];
      if (prev && prev.target_price !== price) {
        const diff = price - prev.target_price;
        const diffColor = diff >= 0 ? '#4CAF50' : '#F44336';
        const arrow = diff >= 0 ? '↑' : '↓';
        changeIndicator = `<span style="color: ${diffColor}; font-size: 8px;"> ${arrow}${Math.abs(diff).toFixed(0)}</span>`;
      }

      // Mark actual prices with a checkmark
      const actualIndicator = isActual ? '<span style="color: #4CAF50;"> ✓</span>' : '';

      html += `<div style="color: #aaa;">${horizon}${actualIndicator}</div>`;
      html += `<div>$${price?.toLocaleString()}${changeIndicator}</div>`;
      html += `<div style="color: ${pctColor};">${pctChange >= 0 ? '+' : ''}${pctChange?.toFixed(2)}%</div>`;
    }

    html += `</div>`;

    panelEl.innerHTML = html;

    // Store current data as previous for next comparison
    state.v4ForwardCurvePreviousData = {};
    for (const [, data] of Object.entries(state.v4ForwardCurveHorizonData)) {
      state.v4ForwardCurvePreviousData[data.horizon] = { ...data };
    }
  },

  /**
   * Sets the data for the main candlestick series.
   * @param {import('./state.js').CandlestickData[]} data - Array of candlestick data points.
   */
  updateCandleSeries(data) {
    state.candleSeries?.setData(shiftDataToLocalTime(data));
    const shiftSeconds = state.lineShiftMinutes * 60;
    // Apply timezone conversion first, then time shift
    const timezoneConvertedData = shiftDataToLocalTime(data);
    const closePrices = timezoneConvertedData.map(d => ({ time: d.time + shiftSeconds, value: d.close }));
    state.closePriceSeries?.setData(closePrices);
  },

  /**
   * Updates a single candlestick data point in the main series (used for live updates).
   * @param {import('./state.js').CandlestickData} candle - The candlestick data point to update.
   */
  updateSingleCandle(candle) {
    state.candleSeries?.update(shiftPointToLocalTime(candle));
    const shiftSeconds = state.lineShiftMinutes * 60;
//    state.closePriceSeries?.update(shiftPointToLocalTime({ time: candle.time + shiftSeconds, value: candle.close }));
  },

  /**
   * Refreshes the close price series based on the current candle data and lineShiftMinutes.
   */
  refreshClosePriceSeries() {
    // V5 UPGRADE: The series.data() method is deprecated. The recommended way is to
    // manage the data state outside the chart. Since the data is already passed
    // to updateCandleSeries, we should store it in the state for reuse.
    // For now, leaving as is, but this is a candidate for future refactoring.
    const candleData = state.candleSeries?.data();
    if (candleData && candleData.length > 0) {
      const shiftSeconds = state.lineShiftMinutes * 60;
      // candleData is already timezone-converted, so just apply time shift
      const closePrices = candleData.map(d => ({ time: d.time + shiftSeconds, value: d.close }));
      state.closePriceSeries?.setData(closePrices);
    }
  },

  /**
   * Updates prediction visualization elements (dots, markers, and confidence bands).
   * @param {Object} predictionData - Prediction data to update
   * @param {import('./state.js').LineData[]} [predictionData.predictedPricePoints] - Array of prediction dot points
   * @param {import('./state.js').LineData[]} [predictionData.predictionPricePoints] - Array of prediction price points
   * @param {import('./state.js').LineData[]} [predictionData.binancePricePoints] - Array of Binance price points
   */
  updatePredictionVisuals(predictionData) {

    const { predictedPricePoints, predictionPricePoints, binancePricePredictedPoints, mapeLowerPoints, mapeUpperPoints } = predictionData;

    if (predictedPricePoints) {
      state.predictedDots?.setData(shiftDataToLocalTime(predictedPricePoints.filter(pred => pred !== null && pred !== undefined)));
    }

    if (predictionPricePoints) {
      state.predictionPriceLine?.setData(shiftDataToLocalTime(predictionPricePoints.filter(pred => pred !== null && pred !== undefined)));
    }

    if (binancePricePredictedPoints) {
      state.binancePriceLine?.setData(shiftDataToLocalTime(binancePricePredictedPoints.filter(pred => pred !== null && pred !== undefined)));
    }

    if (mapeLowerPoints) {

      state.mapeLowerLine?.setData(shiftDataToLocalTime(mapeLowerPoints.filter(lmp => lmp !== null && lmp !== undefined)));
    }

    if (mapeUpperPoints) {
      state.mapeUpperLine?.setData(shiftDataToLocalTime(mapeUpperPoints.filter(mup => mup !== null && mup !== undefined)));
    }

    },

  /**
   * Parse an RFC3339 timestamp and align it to the current interval
   * @param {string} timeStr - RFC3339 timestamp string
   * @returns {number} - Aligned timestamp in milliseconds with collision handling
   */
  parseAndAlignTime(timeStr) {
    const parsedTime = parseTimeToSecondsUTC(timeStr);

    // If force bar alignment is enabled, align to the start of candle intervals
    if (state.forceBarAlignment) {
      return parsedTime - (parsedTime % (config.currentInterval));
    }

    // Otherwise return the raw parsed timestamp
    return parsedTime;
  },

  /**
   * Central utility to update all markers on the chart.
   * It combines prediction markers and strategy event markers.
   */
  updateAllMarkers() {
    if (!state.candleSeries) return;

    const allMarkers = [...state.seriesMarkers, ...state.strategyEventMarkers];

    // this.printMarkerTimesRFC3339(allMarkers, { intervalSeconds: config.currentInterval, label: 'ALL MARKERS', showRemainder: true });

    const sortedMarkers = this.sortMarkers(allMarkers);
    // this.printMarkerTimesRFC3339(sortedMarkers, { intervalSeconds: config.currentInterval, label: 'SORTED MARKERS', showRemainder: true });

    // align markers to candle intervals - create new objects to avoid modifying originals
    const alignedMarkers = sortedMarkers.map(m => {
      // Parse and align to UTC interval boundaries
      const alignedTime = this.parseAndAlignTime(m.time);

      // CRITICAL: Apply timezone shift to match the candle coordinate system
      // Candles are shifted via shiftDataToLocalTime(), markers must be shifted too
      const shiftedTime = shiftTimeStampToLocal(alignedTime);

      return {
        ...m,
        time: shiftedTime
      };
    });

    this.printMarkerTimesRFC3339(alignedMarkers, { intervalSeconds: config.currentInterval, label: 'ALIGNED MARKERS', showRemainder: true });

    state.markersAPI.setMarkers(alignedMarkers); // still apply (clears markers)
  },

  isAlignedToInterval(sec, intervalSeconds) {
    if (!Number.isFinite(sec)) return false;
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return true; // no interval -> skip check
    return (sec % intervalSeconds) === 0;
  },

  sortMarkers(markers) {
    return (Array.isArray(markers) ? markers : [])
      .slice()
        .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  },

  printMarkerTimesRFC3339(markers, { intervalSeconds, label = 'MARKERS', showRemainder = false } = {}) {
    const src = Array.isArray(markers) ? markers : [];

    const rows = src.map((m, i) => {
      const sec = parseTimeToSecondsUTC(m.time);
      const aligned = this.isAlignedToInterval(sec, intervalSeconds);
      const remainder = (showRemainder && Number.isFinite(sec) && Number.isFinite(intervalSeconds))
        ? (sec % intervalSeconds)
        : undefined;

      return {
        i,
        time_raw: m.time,
        seconds: sec,
        rfc3339: toRFC3339FromSeconds(sec),
        aligned,
        ...(showRemainder ? { remainder } : {}),
        price: m.price,
        shape: m.shape,
        position: m.position,
      };
    });

    logger.debug('Chart data debug', { ctx: ['Chart', 'Debug'], label, count: rows.length, intervalSeconds: intervalSeconds ?? 'n/a' });
    // console.table(rows);

    const secs = rows.map(r => r.seconds).filter(Number.isFinite);
    if (secs.length) {
      const minS = Math.min(...secs);
      const maxS = Math.max(...secs);
      const misaligned = rows.filter(r => r.aligned === false).length;
      logger.debug('Chart data coverage', {
        ctx: ['Chart', 'Debug'],
        label,
        minS,
        maxS,
        minTime: toRFC3339FromSeconds(minS),
        maxTime: toRFC3339FromSeconds(maxS),
        misaligned,
        total: rows.length
      });
    } else {
      logger.debug('Chart data - no valid times', { ctx: ['Chart', 'Debug'], label });
    }
  },


  /**
   * Adds a prediction marker to the chart.
   * @param {import('./state.js').SeriesMarker} marker - The marker to add.
   */
  addMarker(marker) {
    state.seriesMarkers.push(marker);
    this.updateAllMarkers();
  },

  /**
   * Clears all prediction markers from the chart.
   */
  clearMarkers() {
    state.seriesMarkers = [];
    this.updateAllMarkers();
  },

  /**
   * Updates all prediction visualizations based on batch prediction data
   * @param {Array<{time: number, price: number}>} predictions - Array of processed predictions
   */
  updateAllPredictions(predictions) {
    if (!Array.isArray(predictions) || predictions.length === 0) {
      return;
    }

    // Create dot points for the line series
    const predictedPricePoints = predictions.map(pred => ({
      time: this.parseAndAlignTime(pred.predicted_time),
      value: pred.predicted_price,
    }));

    // Create prediction price points (for the cyan line)
    const predictionPricePoints = predictions.map(pred => ({
      time: this.parseAndAlignTime(pred.prediction_time),
      value: pred.prediction_price
    }));

    // Create binance price points (for the cyan line)
    const binancePricePredictedPoints = predictions
      .filter(pred => pred.predicted_time !== null && pred.binance_trade_price_predicted !== null)
      .map(pred => ({
        time: this.parseAndAlignTime(pred.predicted_time),
        value: pred.binance_trade_price_predicted
      }));

    const { mapeLowerPoints, mapeUpperPoints } = this.createMapePoints(predictions);

    // Update all visuals in one batch
    this.updatePredictionVisuals({
      predictedPricePoints,
      predictionPricePoints,
      binancePricePredictedPoints: binancePricePredictedPoints, // Pass the new data
      mapeLowerPoints,
      mapeUpperPoints
    });



  },

  /**
   * Adds a new prediction to the chart
   * @param {{time: number, price: number}} prediction
   */

  addNewPrediction(prediction) {

    const newPredictionDot = {
      time: this.parseAndAlignTime(prediction.predicted_time),
      value: prediction.predicted_price,
    };

    state.predictedDots?.update(shiftPointToLocalTime(newPredictionDot));

    const newPredictionPriceDot = {
      time: this.parseAndAlignTime(prediction.prediction_time),
      value: prediction.prediction_price,
    };

    state.predictionPriceLine?.update(shiftPointToLocalTime(newPredictionPriceDot));

    const { mapeLowerPoints, mapeUpperPoints } = this.createMapePoints([prediction]);

    if (mapeLowerPoints.length > 0) {
      state.mapeLowerLine?.update(shiftPointToLocalTime(mapeLowerPoints[0]));
    }
    if (mapeUpperPoints.length > 0) {
      state.mapeUpperLine?.update(shiftPointToLocalTime(mapeUpperPoints[0]));
    }
  },


  /**
   * Updates an existing prediction on the chart
   * @param {{time: number, price: number}} prediction
   */

  updateLatestPrediction(prediction) {

    const newPredictionDot = {
      time: this.parseAndAlignTime(prediction.predicted_time),
      value: prediction.predicted_price,
    }

    state.predictedDots?.update(shiftPointToLocalTime(newPredictionDot));

    const newPredictionPriceDot = {
      time: this.parseAndAlignTime(prediction.prediction_time),
      value: prediction.prediction_price,
    };

    state.predictionPriceLine?.update(shiftPointToLocalTime(newPredictionPriceDot));

  },

  /**
   * Updates an existing prediction on the chart
   * @param {{time: number, price: number}} prediction
   */

  updateDerivedMeasures(prediction) {

    if (prediction.binance_trade_time_predicted != null && prediction.binance_trade_price_predicted != null) {
      const newBinancePricePredictedDot = {
        time: this.parseAndAlignTime(prediction.binance_trade_time_predicted),
        value: prediction.binance_trade_price_predicted,
      };

      state.binancePriceLine?.update(shiftPointToLocalTime(newBinancePricePredictedDot));

    }

    // Update MAPE lines
    const { mapeLowerPoints, mapeUpperPoints } = this.createMapePoints([prediction]);

    if (mapeLowerPoints.length > 0) {
      state.mapeLowerLine?.update(shiftPointToLocalTime(mapeLowerPoints[0]),true);
    }

    if (mapeUpperPoints.length > 0) {
      state.mapeUpperLine?.update(shiftPointToLocalTime(mapeUpperPoints[0]),true);
    }

  },

  /**
   * Helper method to format timestamps to concise date string for tooltips
   * @param {string} rfc3339_ts - RFC3339 formatted string
   * @returns {string} - Formatted concise date string
   */
  getDisplayTimeFromRFC3339(rfc3339_ts) {
    const date = new Date(rfc3339_ts);
    // Format: May 3, 15:30
    const options = {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false // Use 24-hour format
    };

    if (state.timeDisplayMode === 'UTC') {
      return date.toLocaleDateString('en-US', {
        ...options,
        timeZone: 'UTC'
      });
    }
    else if (state.timeDisplayMode === 'NY') {
      return date.toLocaleDateString('en-US', {
        ...options,
        timeZone: 'America/New_York'
      });
    }
    else {
      return date.toLocaleDateString(undefined, options);
    }
  },

  /**
   * Handles crosshair move events to show hover markers
   * @param {Object} param - The crosshair move event parameter.
   */
  handleCrosshairMove: (function() {

    // Use a flag to prevent recursive calls
    let isUpdating = false;

    return function(param) {

      if (!param) return;

      if (param.point && param.point.x) {
        this.updateTimeLabel(param.point.x, param.time);
      }
      else {
        state.timeLabel.style.display = 'none';
      }

      // Exit early if we're already in the middle of an update
      if (isUpdating) return;

      // Exit early if necessary components aren't available
      if (!state.chart || !state.predictedDots || !state.blueDotSeries) return;

      // PRIORITY 1: Check strategy markers FIRST (entry/exit markers take priority)
      const strategyMarkerTooltip = this.checkStrategyMarkerHover(param);
      if (strategyMarkerTooltip && state.tooltipElement) {
        try {
          isUpdating = true;
          state.lastHoveredPredictionTime = null;
          state.blueDotSeries.setData([]);

          const tooltipX = param.point.x + 15;
          const tooltipY = param.point.y + 15;
          state.tooltipElement.innerHTML = strategyMarkerTooltip;
          state.tooltipElement.style.left = `${tooltipX}px`;
          state.tooltipElement.style.top = `${tooltipY}px`;
          state.tooltipElement.style.display = 'block';
        } finally {
          isUpdating = false;
        }
        return; // Exit early - strategy marker takes priority
      }

      // PRIORITY 2: Check forward curve horizon markers (with proximity detection)
      if (param.time && state.forwardCurveHorizonData && param.point) {
        const crosshairTime = param.time;
        const PROXIMITY_SECONDS = 1800; // 30 minutes tolerance for easier hover

        // Find the closest horizon point within proximity
        let closestHorizon = null;
        let closestDistance = Infinity;

        for (const [timeStr, horizonData] of Object.entries(state.forwardCurveHorizonData)) {
          const horizonTime = parseInt(timeStr);
          const distance = Math.abs(horizonTime - crosshairTime);
          if (distance < PROXIMITY_SECONDS && distance < closestDistance) {
            closestDistance = distance;
            closestHorizon = { time: horizonTime, data: horizonData };
          }
        }

        if (closestHorizon && state.tooltipElement) {
          // Also check Y proximity - get the price at that point and compare to crosshair Y
          const horizonData = closestHorizon.data;
          const seriesData = param.seriesData?.get(state.forwardCurveSeries);

          // Check if we're close enough in price (Y axis)
          if (seriesData) {
            const priceDiff = Math.abs(seriesData.value - horizonData.target_price);
            const priceThreshold = horizonData.current_price * 0.005; // 0.5% of price

            if (priceDiff < priceThreshold) {
              try {
                isUpdating = true;
                state.lastHoveredPredictionTime = null;
                state.blueDotSeries?.setData([]);

                const tooltipX = param.point.x + 15;
                const tooltipY = param.point.y + 15;

                const pctChange = horizonData.pct_change?.toFixed(2) || '0.00';
                const pctColor = parseFloat(pctChange) >= 0 ? '#4CAF50' : '#F44336';

                let tooltipHTML = `
                  <div style="font-weight: bold; margin-bottom: 5px; color: #4CAF50;">
                    V5 Curve ${horizonData.horizon}
                  </div>
                  <div>Current: $${horizonData.current_price?.toLocaleString()}</div>
                  <div>Predicted: <span style="color: ${pctColor}; font-weight: bold;">$${horizonData.target_price?.toLocaleString()}</span></div>
                  <div style="color: ${pctColor};">Change: ${pctChange}%</div>
                `;

                if (horizonData.lower_90 !== undefined && horizonData.upper_90 !== undefined) {
                  tooltipHTML += `
                    <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 5px; font-size: 10px; color: #888;">
                      90% CI: ${horizonData.lower_90?.toFixed(2)}% to ${horizonData.upper_90?.toFixed(2)}%
                    </div>
                  `;
                }

                state.tooltipElement.innerHTML = tooltipHTML;
                state.tooltipElement.style.left = `${tooltipX}px`;
                state.tooltipElement.style.top = `${tooltipY}px`;
                state.tooltipElement.style.display = 'block';
              } finally {
                isUpdating = false;
              }
              return; // Exit early - horizon marker takes priority over prediction dots
            }
          }
        }
      }

      // PRIORITY 2.5: Check V4 forward curve horizon markers (with proximity detection)
      if (param.time && state.v4ForwardCurveHorizonData && param.point) {
        const crosshairTime = param.time;
        const PROXIMITY_SECONDS = 1800; // 30 minutes tolerance for easier hover

        // Find the closest V4 horizon point within proximity
        let closestHorizon = null;
        let closestDistance = Infinity;

        for (const [timeStr, horizonData] of Object.entries(state.v4ForwardCurveHorizonData)) {
          const horizonTime = parseInt(timeStr);
          const distance = Math.abs(horizonTime - crosshairTime);
          if (distance < PROXIMITY_SECONDS && distance < closestDistance) {
            closestDistance = distance;
            closestHorizon = { time: horizonTime, data: horizonData };
          }
        }

        if (closestHorizon && state.tooltipElement) {
          // Also check Y proximity - get the price at that point and compare to crosshair Y
          const horizonData = closestHorizon.data;
          const seriesData = param.seriesData?.get(state.v4ForwardCurveSeries);

          // Check if we're close enough in price (Y axis)
          if (seriesData) {
            const priceDiff = Math.abs(seriesData.value - horizonData.target_price);
            const priceThreshold = horizonData.current_price * 0.005; // 0.5% of price

            if (priceDiff < priceThreshold) {
              try {
                isUpdating = true;
                state.lastHoveredPredictionTime = null;
                state.blueDotSeries?.setData([]);

                const tooltipX = param.point.x + 15;
                const tooltipY = param.point.y + 15;

                const pctChange = horizonData.pct_change?.toFixed(2) || '0.00';
                const pctColor = parseFloat(pctChange) >= 0 ? '#4CAF50' : '#F44336';
                const isActual = horizonData.is_actual ? ' (Actual)' : '';

                let tooltipHTML = `
                  <div style="font-weight: bold; margin-bottom: 5px; color: #22d3ee;">
                    V4.32 Curve ${horizonData.horizon}${isActual}
                  </div>
                  <div>Liq Fix Price: $${horizonData.current_price?.toLocaleString()}</div>
                  <div>Predicted: <span style="color: ${pctColor}; font-weight: bold;">$${horizonData.target_price?.toLocaleString()}</span></div>
                  <div style="color: ${pctColor};">Change: ${pctChange}%</div>
                `;

                if (horizonData.lower_90 !== undefined && horizonData.upper_90 !== undefined) {
                  tooltipHTML += `
                    <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 5px; font-size: 10px; color: #888;">
                      90% CI: ${horizonData.lower_90?.toFixed(2)}% to ${horizonData.upper_90?.toFixed(2)}%
                    </div>
                  `;
                }

                state.tooltipElement.innerHTML = tooltipHTML;
                state.tooltipElement.style.left = `${tooltipX}px`;
                state.tooltipElement.style.top = `${tooltipY}px`;
                state.tooltipElement.style.display = 'block';
              } finally {
                isUpdating = false;
              }
              return; // Exit early - V4 horizon marker takes priority over prediction dots
            }
          }
        }
      }

      // PRIORITY 3: Get the series data directly from the crosshair event
      const predictedDot = param.seriesData?.get(state.predictedDots);

      // Only process if we're directly over a prediction dot
      if (predictedDot) {

        // Get the prediction time (dot time) and current time
        const predictedDotBarTime = predictedDot.time;

        // Convert the predictedDotBarTime back to UTC
        const predictedDotBarTimeUtc = unshiftTimeStampToUtc(predictedDotBarTime);

        // Calculate tooltip position
        const tooltipX = param.point.x + 15; // Offset to avoid overlapping the cursor
        const tooltipY = param.point.y + 15;


        // Check if this point is the same as the last point hovered
        if (state.lastHoveredPredictionTime === predictedDotBarTimeUtc) {

          // Update and show tooltip
          // state.tooltipElement.innerHTML = tooltipHTML;
          state.tooltipElement.style.left = `${tooltipX}px`;
          state.tooltipElement.style.top = `${tooltipY}px`;
          state.tooltipElement.style.display = 'block';

          // Do not process if the time has not changed
          return;
        }

        // Update the last hovered prediction time
        state.lastHoveredPredictionTime = predictedDotBarTimeUtc;

        // Look up the complete prediction data from our stored predictions
        const completeData = state.predictions?.find(p => this.parseAndAlignTime(p.predicted_time) === predictedDotBarTimeUtc);

        if (!completeData) {
          return;
        }

        // Use prediction_time if available from standardized field names, with fallbacks
        const predictionTime = completeData.prediction_time || null;
        const predictionPrice = completeData.prediction_price || null;

        // Show tooltip with prediction metadata
        if (state.tooltipElement) {

          // Format metadata for display using the standardized field names
          let tooltipHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">Prediction Data - Timezone: ${state.timeDisplayMode}</div>
            <div style="color:${config.chartColors.predictedDots}">Predicted Time: ${completeData.predicted_time ? this.getDisplayTimeFromRFC3339(completeData.predicted_time) : "N/A"}</div>
            <div style="color:${config.chartColors.predictedDots}">Predicted Price: ${completeData.predicted_price ? completeData.predicted_price.toFixed(2) : "N/A"}</div>`;

          // Add raw predictionTime and predictionPrice values
          tooltipHTML += `<div style="color:${config.chartColors.predictionPriceLine}">Prediction Time: ${completeData.prediction_time ? this.getDisplayTimeFromRFC3339(completeData.prediction_time) : "N/A"}</div>`;
          tooltipHTML += `<div style="color:${config.chartColors.predictionPriceLine}">Prediction Price: ${completeData.prediction_price ? completeData.prediction_price.toFixed(2) : "N/A"}</div>`;

          // const mapeLowerPoint = param.seriesData?.get(state.mapeLowerLine);
          // const mapeUpperPoint = param.seriesData?.get(state.mapeUpperLine);
          // tooltipHTML += `<div style="color: pink;">MAPE Lower: ${mapeLowerPoint ? mapeLowerPoint.value.toFixed(4) : "N/A"}</div>`;
          // tooltipHTML += `<div style="color: pink;">MAPE Upper: ${mapeUpperPoint ? mapeUpperPoint.value.toFixed(4) : "N/A"}</div>`;
          // Add Binance price data if available

          if (state.verboseTooltip) {
              tooltipHTML += `<div style="color:${config.chartColors.binancePricePredictedPoints};">Binance Predicted Time: ${completeData.binance_trade_time_predicted ? this.getDisplayTimeFromRFC3339(completeData.binance_trade_time_predicted) : "--"}</div>`;
          }
          tooltipHTML += `<div style="color:${config.chartColors.binancePricePredictedPoints};">Binance Predicted Price: ${completeData.binance_trade_price_predicted ? completeData.binance_trade_price_predicted.toFixed(2) : "--"}</div>`;

          if (state.verboseTooltip) {
            tooltipHTML += `<div style="color:${config.chartColors.binancePricePredictionPoints};">Binance Prediction Time: ${completeData.binance_trade_time_prediction ? this.getDisplayTimeFromRFC3339(completeData.binance_trade_time_prediction) : "--"}</div>`;
          }
          tooltipHTML += `<div style="color:${config.chartColors.binancePricePredictionPoints};">Binance Prediction Price: ${completeData.binance_trade_price_prediction ? completeData.binance_trade_price_prediction.toFixed(2) : "--"}</div>`;


          if (state.verboseTooltip) {
            // Add a spacer with a thin line
            tooltipHTML += `<div style="margin: 5px 0; border-top: 1px solid rgba(255,255,255,0.3);"></div>`;


            const actualMove = completeData.binance_trade_price_predicted - completeData.binance_trade_price_prediction;
            const actualMovePercentage = (actualMove / completeData.binance_trade_price_prediction) * 100;
            const actualPredictedMove = completeData.predicted_price - completeData.binance_trade_price_prediction;
            const actualPredictedMovePercentage = (actualPredictedMove / completeData.binance_trade_price_prediction) * 100;

            const prediction_error = completeData.binance_trade_price_predicted - completeData.predicted_price;
            const prediction_error_percentage = (prediction_error / completeData.predicted_price) * 100;
            const prediction_error_color = actualMove*actualPredictedMove > 0 ? "lightgreen" : "lightsalmon";
            tooltipHTML += `<div style="color: ${prediction_error_color};">Prediction Error: ${completeData.binance_trade_price_predicted ? prediction_error.toFixed(2) : "--"} (${completeData.binance_trade_price_predicted ? prediction_error_percentage.toFixed(2) : "--"}%)</div>`;

            const actualPnL = actualPredictedMove * actualMove > 0 ? Math.abs(actualMove) : -Math.abs(actualMove);
            const actualPnLPercentage = (actualPnL / completeData.binance_trade_price_prediction) * 100;
            const pnlColor = actualPnL > 0 ? "lightgreen" : "darksalmon";
            tooltipHTML += `<div style="color: ${pnlColor}; font-weight: bold;">Actual PnL: ${completeData.binance_trade_price_predicted ? actualPnL.toFixed(2) : "--"} (${completeData.binance_trade_price_prediction ? actualPnLPercentage.toFixed(2) : "--"}%)</div>`;

            // Add a spacer with a thin line
            tooltipHTML += `<div style="margin: 5px 0; border-top: 1px solid rgba(255,255,255,0.3);"></div>`;

            tooltipHTML += `<div>Predicted Move: ${completeData.predicted_move.toFixed(2)} (${completeData.predicted_move_percentage.toFixed(2)}%)</div>`;
            tooltipHTML += `<div>Actual Predicted Move: ${completeData.binance_trade_price_prediction ? actualPredictedMove.toFixed(2) : "--"} (${completeData.binance_trade_price_prediction ? actualPredictedMovePercentage.toFixed(2) : "--"}%)</div>`;
            tooltipHTML += `<div>Actual Move: ${completeData.binance_trade_price_predicted ? actualMove.toFixed(2) : "--"} (${completeData.binance_trade_price_predicted ? actualMovePercentage.toFixed(2) : "--"}%)</div>`;

            const move_diff = actualMove - completeData.predicted_move;
            const move_diff_percentage = (move_diff / completeData.predicted_move) * 100;

            const moveColor = move_diff > 0 ? "lightgreen" : "darksalmon";
            tooltipHTML += `<div style="color: ${moveColor};">Move Diff: ${move_diff.toFixed(2)} (${move_diff_percentage.toFixed(2)}%)</div>`; // Updated label and format

            // Add MAPE score if available
            if (completeData.mape_score != null) {
              // Format MAPE with 2 decimal places and color based on value
              const mapeValue = completeData.mape_score.toFixed(2);
              let mapeColor = config.chartColors.mapeCalcLine;

              tooltipHTML += `<div style="color: ${mapeColor};">MAPE (20): ${mapeValue}%</div>`;
            }
          }

          // Update and show tooltip
          state.tooltipElement.innerHTML = tooltipHTML;
          state.tooltipElement.style.left = `${tooltipX}px`;
          state.tooltipElement.style.top = `${tooltipY}px`;
          state.tooltipElement.style.display = 'block';
        }

        try {
          isUpdating = true;
          // Show the prediction marker at the calculated time position

          if (completeData.prediction_time) {

            let val = null;
            let dotColor = config.chartColors.blueDotSeries; // Default to blue dot color

            if (completeData.binance_trade_price_prediction != null) {

              val = completeData.binance_trade_price_prediction;

            } else {

              const targetTime = parseTimeToSecondsUTC(completeData.prediction_time);

              // Find the closest prediction to the target time
              const predictionData = state.predictions.reduce((latest, p) => {
                const time = parseTimeToSecondsUTC(p.binance_trade_time_predicted);
                return (time <= targetTime && (!latest || time > parseTimeToSecondsUTC(latest.binance_trade_time_predicted))) ? p : latest;
              }, null);

              if (predictionData) {
                val = predictionData.binance_trade_price_predicted;
              }

            }

            // If no binance data available, use prediction_price as fallback
            if (val == null && completeData.prediction_price != null) {
              val = completeData.prediction_price;
              dotColor = config.chartColors.predictionPriceLine; // Use prediction line color for fallback
            }

            // Only add marker if we have valid time and price
            if (val != null) {
              state.blueDotSeries.setData([{
                time: shiftTimeStampToLocal(this.parseAndAlignTime(completeData.prediction_time)),
                value: val,
                color: dotColor
              }]);
            }


          } else {
            // Clear markers if data is incomplete
            state.blueDotSeries.setData([]);
          }

        }
        finally {

          isUpdating = false;

        }
      } else{

        try {

          isUpdating = true;
          // Clear markers when not over a prediction dot or strategy marker

          state.lastHoveredPredictionTime = null;
          state.blueDotSeries.setData([]);

          if (state.tooltipElement) {
            state.tooltipElement.style.display = 'none';
          }

        } finally {

          isUpdating = false;

        }
      }
    };
  })(),

  /**
   * Handles mouse leave events on the chart container to clear hover markers.
   */
  handleChartMouseLeave() {
    if (state.blueDotSeries) {
      state.blueDotSeries.setData([]);
    }
    if (state.tooltipElement) {
      state.tooltipElement.style.display = 'none';
    }
  },

  /**
   * Checks if the mouse is hovering over a strategy marker and returns tooltip HTML if so.
   * @param {Object} param - The crosshair move event parameter
   * @returns {string|null} - Tooltip HTML if hovering over a marker, null otherwise
   */
  checkStrategyMarkerHover(param) {
    if (!param.point || !state.strategyEventMarkers || state.strategyEventMarkers.length === 0) {
      return null;
    }

    const mouseX = param.point.x;
    const mouseY = param.point.y;
    const hitRadius = 20; // Pixels within which to detect hover

    // Check each strategy marker
    for (const marker of state.strategyEventMarkers) {
      // Apply the same time transformation as updateAllMarkers()
      const alignedTime = this.parseAndAlignTime(marker.time);
      const shiftedTime = shiftTimeStampToLocal(alignedTime);

      // Convert marker time and price to screen coordinates
      const markerX = state.chart.timeScale().timeToCoordinate(shiftedTime);
      const markerY = state.candleSeries.priceToCoordinate(marker.price);

      if (markerX === null || markerY === null) continue;

      // Check if mouse is within hit radius of the marker
      const distance = Math.sqrt(Math.pow(mouseX - markerX, 2) + Math.pow(mouseY - markerY, 2));

      if (distance <= hitRadius) {
        // Get the full event data for this marker
        const eventData = state.strategyEventData.get(marker.id);
        if (eventData) {
          return this.buildStrategyMarkerTooltip(eventData);
        }
      }
    }

    return null;
  },

  /**
   * Builds tooltip HTML for a strategy marker (entry or exit).
   * @param {Object} eventData - The full strategy event data
   * @returns {string} - The tooltip HTML
   */
  buildStrategyMarkerTooltip(eventData) {
    const position = eventData.position; // 'OPEN' or 'CLOSE'
    const data = eventData.event_data || {};

    if (position === 'OPEN') {
      // Entry marker - show entry info
      const direction = data.signal_direction || 'N/A';
      const entryPrice = data.entry_price ? data.entry_price.toFixed(2) : 'N/A';
      const directionColor = direction === 'LONG' ? 'rgba(0, 255, 136, 1)' : 'rgba(255, 68, 68, 1)';
      const emoji = direction === 'LONG' ? '🟢' : '🔴';

      return `
        <div style="font-weight: bold; margin-bottom: 5px; color: ${directionColor};">${emoji} ENTRY - ${direction}</div>
        <div>Entry Price: $${entryPrice}</div>
        <div style="color: #888; font-size: 0.9em;">${eventData.event_time ? this.getDisplayTimeFromRFC3339(eventData.event_time) : ''}</div>
      `;
    } else if (position === 'CLOSE') {
      // Exit marker - show PNL info based on IPC Contract Mode
      const pnlDollar = data.pnl;  // Dollar P&L with contracts
      const pnlPercentage = data.pnl_percentage;  // Percentage P&L
      const entryPrice = data.entry_price ? data.entry_price.toFixed(2) : 'N/A';
      const exitPrice = data.current_price ? data.current_price.toFixed(2) : 'N/A';
      const closeReason = data.close_reason || 'N/A';

      // Check global IPC Contract Mode (default: false = show percentage)
      const useIpcMode = window.ipcContractMode || false;

      // Determine display value based on mode
      let pnlDisplay, isProfitable;
      if (useIpcMode) {
        // IPC Mode: Show dollar P&L with contracts
        isProfitable = pnlDollar >= 0;
        const pnlSign = pnlDollar >= 0 ? '+' : '';
        pnlDisplay = `${pnlSign}$${pnlDollar ? Math.abs(pnlDollar).toFixed(2) : 'N/A'}`;
      } else {
        // Default: Show percentage P&L (per BTC)
        isProfitable = pnlPercentage >= 0;
        const pctSign = pnlPercentage >= 0 ? '+' : '';
        pnlDisplay = pnlPercentage !== undefined && pnlPercentage !== null
          ? `${pctSign}${pnlPercentage.toFixed(2)}%`
          : 'N/A';
      }

      const pnlColor = isProfitable ? 'rgba(173, 255, 47, 1)' : 'rgba(255, 0, 255, 1)';
      const emoji = isProfitable ? '💚' : '💔';
      const modeLabel = useIpcMode ? ' (IPC)' : '';

      return `
        <div style="font-weight: bold; margin-bottom: 5px; color: ${pnlColor};">${emoji} EXIT - ${closeReason}</div>
        <div style="color: ${pnlColor}; font-weight: bold; font-size: 1.1em;">PNL${modeLabel}: ${pnlDisplay}</div>
        <div>Entry: $${entryPrice} → Exit: $${exitPrice}</div>
        <div style="color: #888; font-size: 0.9em;">${eventData.event_time ? this.getDisplayTimeFromRFC3339(eventData.event_time) : ''}</div>
      `;
    }

    return null;
  },

  /**
   * Creates the data point arrays for the upper and lower MAPE bounds from a predictions array.
   * @param {Array} predictions - The array of processed predictions.
   * @returns {{mapeLowerPoints: Array, mapeUpperPoints: Array}} An object containing the points for both lines.
   */
  createMapePoints(predictions) {
    if (!Array.isArray(predictions)) {
      return { mapeLowerPoints: [], mapeUpperPoints: [] };
    }

    const mainColor = config.chartColors.mapeCalcLine;
    const fallbackColor = config.chartColors.mapeLastKnownLine;

    const validMapePredictions = predictions.filter(pred =>
      typeof pred.mape_score === 'number' && pred.predicted_time != null
    );

    // Create lower bound points from the filtered array.
    const mapeLowerPoints = validMapePredictions.map(pred => ({
      time: this.parseAndAlignTime(pred.predicted_time),
      value: pred.predicted_price * (1 - pred.mape_score / 100),
      color: pred.mape_score_type === 'fallback' ? fallbackColor : mainColor
    }));

    // Create upper bound points from the SAME filtered array.
    const mapeUpperPoints = validMapePredictions.map(pred => ({
      time: this.parseAndAlignTime(pred.predicted_time),
      value: pred.predicted_price * (1 + pred.mape_score / 100),
      color: pred.mape_score_type === 'fallback' ? fallbackColor : mainColor
    }));

    return { mapeLowerPoints, mapeUpperPoints };
  },

  /**
   * Updates only the MAPE line series on the chart.
   * @param {Array} predictions - The array of predictions with up-to-date MAPE scores.
   */
  updateMapeSeries(predictions) {
    if (!Array.isArray(predictions)) return;

    // Use the new helper to create the points.
    const { mapeLowerPoints, mapeUpperPoints } = this.createMapePoints(predictions);

    // Set the data for the MAPE series
    state.mapeLowerLine?.setData(shiftDataToLocalTime(mapeLowerPoints));
    state.mapeUpperLine?.setData(shiftDataToLocalTime(mapeUpperPoints));
  },


  /**
   * Creates a tooltip element for displaying prediction metadata.
   */
  createTooltipElement() {
    // Remove any existing tooltip first
    const existingTooltip = document.getElementById('chart-tooltip');

    if (existingTooltip) {

      existingTooltip.remove();

    }

    // Create the tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'chart-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.display = 'none';
    tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '8px 10px';
    tooltip.style.borderRadius = '5px';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.zIndex = '1000';
    tooltip.style.fontSize = '12px';
    tooltip.style.maxWidth = '250px';
    tooltip.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    tooltip.style.border = '1px solid #444';
    document.body.appendChild(tooltip);

    state.tooltipElement = tooltip;
  },

  /* Create time label */
  createTimeLabel() {
    // Remove any existing time label first
    const existingTimeLabel = document.getElementById('time-label');

    if (existingTimeLabel) {
      existingTimeLabel.remove();
    }

    // Create the time label element
    const timeLabel = document.createElement('div');
    timeLabel.id = 'time-label';
    timeLabel.style.position = 'absolute';
    timeLabel.style.bottom = '0';
    timeLabel.style.transform = 'translateX(-50%)';
    timeLabel.style.background = 'rgba(30, 30, 30, 0.9)';
    timeLabel.style.color = 'white';
    timeLabel.style.padding = '2px 6px';
    timeLabel.style.fontSize = '12px';
    timeLabel.style.borderRadius = '2px';
    timeLabel.style.pointerEvents = 'none';
    timeLabel.style.whiteSpace = 'nowrap';
    timeLabel.style.zIndex = '10';
    timeLabel.style.display = 'none';
    document.getElementById('chart-area').appendChild(timeLabel);

    state.timeLabel = timeLabel;
  },

  /**
   * Updates the time label displayed at the bottom of the chart
   * @param {number} x - The x-coordinate position for the label
   * @param {number} timestamp - The timestamp to display in seconds since epoch
   */
  updateTimeLabel(x, timestamp) {

    const date = new Date(timestamp * 1000);
    let formatted = "";
    if (date != null && date instanceof Date && !isNaN(date.getTime())) {
      formatted = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date);
    }

    state.timeLabel.textContent = formatted;
    state.timeLabel.style.display = 'block';
    state.timeLabel.style.left = `${x}px`;
    state.timeLabel.style.bottom = '5px';


    // if (!param.point || !param.point.x) {
    //   state.timeLabel.style.display = 'none';
    //   return;
    // }

    // const date = new Date(param.time * 1000);
    // let formatted = "";
    // if (date != null && date instanceof Date && !isNaN(date.getTime())) {
    //   formatted = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(date);
    // }

    // state.timeLabel.textContent = formatted;
    // state.timeLabel.style.display = 'block';
    // state.timeLabel.style.left = `${param.point.x}px`;
    // state.timeLabel.style.bottom = '5px';

  },

  /**
   * Toggle visibility of the prediction price line
   * @param {boolean} visible - Whether the line should be visible
   */
  togglePredictionPriceLine(visible) {
    if (!state.predictionPriceLine) return;

    state.predictionPriceLine.applyOptions({
      visible: visible
    });

  },

  /**
   * Toggle visibility of the Binance actual price line
   * @param {boolean} visible - Whether the line should be visible
   */
  toggleBinancePriceLine(visible) {
    if (!state.binancePriceLine) {
      return;
    }

    state.binancePriceLine.applyOptions({
      visible: visible
    });
  },

  /**
   * Toggle visibility of the MAPE lower bound line
   * @param {boolean} visible - Whether the line should be visible
   */
  toggleMapeLines(visible) {
    if (!state.mapeLowerLine || !state.mapeUpperLine) {
      return;
    }

    state.mapeLowerLine.applyOptions({
      visible: visible
    });

    state.mapeUpperLine.applyOptions({
      visible: visible
    });
  },

  /**
   * Toggle opacity of the candlestick series to dim/highlight them
   * @param {boolean} dimmed - Whether the candlesticks should be dimmed
   */
  toggleCandlestickOpacity(dimmed) {
    if (!state.candleSeries) return;

    // Apply different opacity settings based on the dimmed state
    state.candleSeries.applyOptions({
      upColor: dimmed ? 'rgba(38,166,154,0.3)' : 'rgba(38,166,154,0.6)',
      downColor: dimmed ? 'rgba(239,83,80,0.3)' : 'rgba(239,83,80,0.6)',
      wickUpColor: dimmed ? 'rgba(38,166,154,0.6)' : 'rgba(38,166,154,1)',
      wickDownColor: dimmed ? 'rgba(239,83,80,0.6)' : 'rgba(239,83,80,1)',
      borderUpColor: dimmed ? 'rgba(38,166,154,0.6)' : 'rgba(38,166,154,1)',
      borderDownColor: dimmed ? 'rgba(239,83,80,0.6)' : 'rgba(239,83,80,1)'
    });
  },

  /**
   * Toggle visibility of the historical candlestick series
   * @param {boolean} visible - Whether the candlesticks should be visible
   */
  toggleHistoricalCandles(visible) {
    if (!state.candleSeries) return;

    state.candleSeries.applyOptions({
      visible: visible
    });

    // NOTE: Do NOT toggle closePriceSeries here - it's a shifted line used for predictions
    // and should be controlled separately via showClosePriceLine state

    // Store visibility state
    state.historicalCandlesVisible = visible;
  },

  /**
   * Toggle visibility of the close price line
   * @param {boolean} isVisible - Whether the line should be visible
   */
  toggleClosePriceLineVisibility(isVisible) {
    if (state.closePriceSeries) {
      state.closePriceSeries.applyOptions({ visible: isVisible });
    }
  },

  /**
   * Toggle visibility of the predicted line (blue dots)
   * @param {boolean} isVisible - Whether the predicted line should be visible
   */
  togglePredictedLine(isVisible) {
    // Store the current visibility state in the application state
    state.showPredictedLine = isVisible;

    if (state.predictedDots) {

      state.predictedDots.applyOptions({
        lineVisible: isVisible,
      });
    }
  },

  /**
   * Toggle visibility of the V5 forward curve (line, markers, bands, and panel)
   * @param {boolean} visible - Whether the curve should be visible
   */
  toggleV5Curve(visible) {
    // Toggle V5 curve series
    state.forwardCurveSeries?.applyOptions({ visible });
    state.forwardCurveMarkers?.applyOptions({ visible });
    state.forwardCurveUpperBand?.applyOptions({ visible });
    state.forwardCurveLowerBand?.applyOptions({ visible });

    // Toggle V5 info panel
    const v5Panel = document.getElementById('forward-curve-panel');
    if (v5Panel) {
      v5Panel.style.display = visible ? 'block' : 'none';
    }

    // Store visibility state
    state.v5CurveVisible = visible;
  },

  /**
   * Toggle visibility of the V4 forward curve (line, markers, bands, and panel)
   * @param {boolean} visible - Whether the curve should be visible
   */
  toggleV4Curve(visible) {
    // Toggle V4 curve series
    state.v4ForwardCurveSeries?.applyOptions({ visible });
    state.v4ForwardCurveMarkers?.applyOptions({ visible });
    state.v4ForwardCurveUpperBand?.applyOptions({ visible });
    state.v4ForwardCurveLowerBand?.applyOptions({ visible });
    state.v4OriginalPredictionLine?.applyOptions({ visible });
    state.v4OriginalPredictionMarkers?.applyOptions({ visible });

    // Toggle V4 info panel
    const v4Panel = document.getElementById('v4-forward-curve-panel');
    if (v4Panel) {
      v4Panel.style.display = visible ? 'block' : 'none';
    }

    // Store visibility state
    state.v4CurveVisible = visible;
  },

  /**
   * Toggle visibility of the smoothed forward curves
   * @param {boolean} visible - Whether the smoothed curves should be visible
   */
  toggleSmoothedCurves(visible) {
    state.smoothedCurvesVisible = visible;

    // When enabling, populate the smoothed curves with current data
    if (visible) {
      if (state.lastV5CurvePoints && state.lastV5CurvePoints.length > 0) {
        const smoothedV5 = this.smoothCurveData(state.lastV5CurvePoints);
        state.v5SmoothedCurveSeries?.setData(smoothedV5);
      }
      if (state.lastV4CurvePoints && state.lastV4CurvePoints.length > 0) {
        const smoothedV4 = this.smoothCurveData(state.lastV4CurvePoints);
        state.v4SmoothedCurveSeries?.setData(smoothedV4);
      }
    }

    state.v5SmoothedCurveSeries?.applyOptions({ visible });
    state.v4SmoothedCurveSeries?.applyOptions({ visible });
  },

  /**
   * Apply Gaussian-weighted smoothing to curve data for a more natural smooth curve.
   * Uses a larger window and weighted average where center points have more influence.
   * @param {Array} data - Array of {time, value} points
   * @param {number} windowSize - Number of points to consider (default 7)
   * @returns {Array} Smoothed data points
   */
  smoothCurveData(data, windowSize = 7) {
    if (!data || data.length < 3) return data;

    // Generate Gaussian weights for the window
    const halfWindow = Math.floor(windowSize / 2);
    const sigma = windowSize / 4;  // Standard deviation
    const weights = [];
    for (let i = -halfWindow; i <= halfWindow; i++) {
      weights.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
    }

    const smoothed = [];
    for (let i = 0; i < data.length; i++) {
      let weightedSum = 0;
      let weightTotal = 0;

      for (let j = -halfWindow; j <= halfWindow; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < data.length) {
          const weight = weights[j + halfWindow];
          weightedSum += data[idx].value * weight;
          weightTotal += weight;
        }
      }

      smoothed.push({
        time: data[i].time,
        value: weightTotal > 0 ? weightedSum / weightTotal : data[i].value
      });
    }
    return smoothed;
  },

  // ============================================
  // INTERPOLATION METHODS FOR FORWARD CURVES
  // ============================================

  /**
   * Interpolate curve points using the selected method
   * @param {Array} rawPoints - Array of {time, value} raw horizon points (sorted by time)
   * @param {number} interval - Interval in seconds between interpolated points
   * @param {string} method - 'linear', 'cubic', or 'monotone'
   * @returns {Array} Interpolated {time, value} points
   */
  interpolateCurve(rawPoints, interval, method = 'linear') {
    if (!rawPoints || rawPoints.length < 2) return rawPoints || [];

    switch (method) {
      case 'cubic':
        return this.cubicSplineInterpolate(rawPoints, interval);
      case 'monotone':
        return this.monotoneConvexInterpolate(rawPoints, interval);
      case 'linear':
      default:
        return this.linearInterpolate(rawPoints, interval);
    }
  },

  /**
   * Linear Interpolation - Simple straight line between points
   * @param {Array} rawPoints - Array of {time, value} points
   * @param {number} interval - Interval in seconds
   * @returns {Array} Interpolated points
   */
  linearInterpolate(rawPoints, interval) {
    const result = [];

    for (let i = 0; i < rawPoints.length - 1; i++) {
      const p1 = rawPoints[i];
      const p2 = rawPoints[i + 1];

      for (let t = p1.time; t < p2.time; t += interval) {
        const factor = (t - p1.time) / (p2.time - p1.time);
        result.push({
          time: t,
          value: p1.value + (p2.value - p1.value) * factor
        });
      }
    }

    // Add final point
    if (rawPoints.length > 0) {
      result.push({ ...rawPoints[rawPoints.length - 1] });
    }

    return result;
  },

  /**
   * Cubic Spline Interpolation - Smooth curve with continuous 1st & 2nd derivatives
   * Uses natural spline (2nd derivative = 0 at endpoints)
   * @param {Array} rawPoints - Array of {time, value} points
   * @param {number} interval - Interval in seconds
   * @returns {Array} Interpolated points
   */
  cubicSplineInterpolate(rawPoints, interval) {
    const n = rawPoints.length;
    if (n < 2) return rawPoints;
    if (n === 2) return this.linearInterpolate(rawPoints, interval);

    // Extract x (time) and y (value) arrays
    const x = rawPoints.map(p => p.time);
    const y = rawPoints.map(p => p.value);

    // Compute spline coefficients using tridiagonal algorithm
    // For natural spline: M[0] = M[n-1] = 0
    const h = [];
    for (let i = 0; i < n - 1; i++) {
      h[i] = x[i + 1] - x[i];
    }

    // Build tridiagonal system for second derivatives M
    const alpha = [0];
    for (let i = 1; i < n - 1; i++) {
      alpha[i] = (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]);
    }

    // Solve tridiagonal system
    const l = [1];
    const mu = [0];
    const z = [0];

    for (let i = 1; i < n - 1; i++) {
      l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
      mu[i] = h[i] / l[i];
      z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
    }

    l[n - 1] = 1;
    z[n - 1] = 0;

    const c = new Array(n).fill(0);
    const b = new Array(n - 1);
    const d = new Array(n - 1);

    for (let j = n - 2; j >= 0; j--) {
      c[j] = z[j] - mu[j] * c[j + 1];
      b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
      d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
    }

    // Generate interpolated points
    const result = [];

    for (let i = 0; i < n - 1; i++) {
      const tStart = x[i];
      const tEnd = x[i + 1];

      for (let t = tStart; t < tEnd; t += interval) {
        const dx = t - x[i];
        const value = y[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
        result.push({ time: t, value });
      }
    }

    // Add final point
    result.push({ time: x[n - 1], value: y[n - 1] });

    return result;
  },

  /**
   * Monotone Convex Interpolation (Hagan-West Algorithm)
   * Gold standard for forward curves - ensures monotonicity, no oscillation
   * @param {Array} rawPoints - Array of {time, value} points
   * @param {number} interval - Interval in seconds
   * @returns {Array} Interpolated points
   */
  monotoneConvexInterpolate(rawPoints, interval) {
    const n = rawPoints.length;
    if (n < 2) return rawPoints;
    if (n === 2) return this.linearInterpolate(rawPoints, interval);

    const x = rawPoints.map(p => p.time);
    const y = rawPoints.map(p => p.value);

    // Step 1: Calculate slopes between consecutive points
    const delta = [];
    for (let i = 0; i < n - 1; i++) {
      delta[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
    }

    // Step 2: Calculate monotone slopes at each point
    // Using Fritsch-Carlson method for monotonicity
    const m = new Array(n);

    // Endpoint slopes
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];

    // Interior slopes
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) {
        // Sign change - set to zero to ensure monotonicity
        m[i] = 0;
      } else {
        // Harmonic mean to ensure monotonicity
        m[i] = (delta[i - 1] + delta[i]) / 2;

        // Clamp to ensure monotonicity (Fritsch-Carlson condition)
        const maxSlope = 3 * Math.min(Math.abs(delta[i - 1]), Math.abs(delta[i]));
        if (Math.abs(m[i]) > maxSlope) {
          m[i] = Math.sign(m[i]) * maxSlope;
        }
      }
    }

    // Additional monotonicity enforcement
    for (let i = 0; i < n - 1; i++) {
      if (delta[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const alpha = m[i] / delta[i];
        const beta = m[i + 1] / delta[i];

        // Ensure we stay in the monotonicity region
        const radius = alpha * alpha + beta * beta;
        if (radius > 9) {
          const tau = 3 / Math.sqrt(radius);
          m[i] = tau * alpha * delta[i];
          m[i + 1] = tau * beta * delta[i];
        }
      }
    }

    // Step 3: Generate interpolated points using Hermite basis
    const result = [];

    for (let i = 0; i < n - 1; i++) {
      const h = x[i + 1] - x[i];
      const tStart = x[i];
      const tEnd = x[i + 1];

      for (let t = tStart; t < tEnd; t += interval) {
        const s = (t - x[i]) / h;  // Normalized position [0, 1]

        // Hermite basis functions
        const h00 = 2 * s * s * s - 3 * s * s + 1;
        const h10 = s * s * s - 2 * s * s + s;
        const h01 = -2 * s * s * s + 3 * s * s;
        const h11 = s * s * s - s * s;

        // Interpolated value
        const value = h00 * y[i] + h10 * h * m[i] + h01 * y[i + 1] + h11 * h * m[i + 1];
        result.push({ time: t, value });
      }
    }

    // Add final point
    result.push({ time: x[n - 1], value: y[n - 1] });

    return result;
  },

  /**
   * Get current interpolation method from state/UI
   * @returns {string} 'linear', 'cubic', or 'monotone'
   */
  getCurrentInterpolationMethod() {
    return state.interpolationMethod || 'linear';
  },

  /**
   * Set interpolation method and re-render curves
   * @param {string} method - 'linear', 'cubic', or 'monotone'
   */
  setInterpolationMethod(method) {
    state.interpolationMethod = method;
    console.log(`[ChartManager] Interpolation method set to: ${method}`);
  },

  /**
   * Re-render curves with current interpolation method using stored curve data
   * Called when interpolation method changes
   */
  reRenderCurves() {
    const method = this.getCurrentInterpolationMethod();
    console.log(`[ChartManager] Re-rendering curves with method: ${method}`);

    // Re-render V5 curve if we have stored data
    if (state.lastV5CurveData) {
      this.updateForwardCurve(state.lastV5CurveData);
    }

    // Re-render V4 curve if we have stored data
    if (state.lastV4CurveData) {
      this.updateV4ForwardCurve(state.lastV4CurveData);
    }
  },

  /**
   * Set V4 curve visibility (all V4 series on chart)
   * @param {boolean} visible - Whether to show V4 curves
   */
  setV4CurveVisibility(visible) {
    console.log(`[ChartManager] V4 curve visibility: ${visible}`);
    state.v4ForwardCurveSeries?.applyOptions({ visible });
    state.v4ForwardCurveMarkers?.applyOptions({ visible });
    state.v4ForwardCurveUpperBand?.applyOptions({ visible });
    state.v4ForwardCurveLowerBand?.applyOptions({ visible });
    state.v4OriginalPredictionLine?.applyOptions({ visible });
    state.v4OriginalPredictionMarkers?.applyOptions({ visible });
  },

  /**
   * Set V5 curve visibility (all V5 series on chart)
   * @param {boolean} visible - Whether to show V5 curves
   */
  setV5CurveVisibility(visible) {
    console.log(`[ChartManager] V5 curve visibility: ${visible}`);
    state.forwardCurveSeries?.applyOptions({ visible });
    state.forwardCurveMarkers?.applyOptions({ visible });
    state.forwardCurveUpperBand?.applyOptions({ visible });
    state.forwardCurveLowerBand?.applyOptions({ visible });
  },

  /**
   * Set V4 info box visibility (panel on chart showing horizon prices)
   * @param {boolean} visible - Whether to show V4 info box
   */
  setV4BoxVisibility(visible) {
    console.log(`[ChartManager] V4 box visibility: ${visible}`);
    state.v4BoxVisible = visible;
    const v4Panel = document.getElementById('v4-forward-curve-panel');
    console.log(`[ChartManager] V4 panel element:`, v4Panel);
    if (v4Panel) {
      v4Panel.style.display = visible ? 'block' : 'none';
    }
  },

  /**
   * Set V5 info box visibility (panel on chart showing horizon prices)
   * @param {boolean} visible - Whether to show V5 info box
   */
  setV5BoxVisibility(visible) {
    console.log(`[ChartManager] V5 box visibility: ${visible}`);
    state.v5BoxVisible = visible;
    const v5Panel = document.getElementById('forward-curve-panel');
    console.log(`[ChartManager] V5 panel element:`, v5Panel);
    if (v5Panel) {
      v5Panel.style.display = visible ? 'block' : 'none';
    }
  },

  /**
   * Make an element draggable within its parent container
   * @param {HTMLElement} element - The element to make draggable
   */
  makeDraggable(element) {
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    element.addEventListener('mousedown', (e) => {
      // Only drag from the element itself, not from child elements that might have their own interactions
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') {
        return;
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // Get current position
      const rect = element.getBoundingClientRect();
      const parentRect = element.parentElement.getBoundingClientRect();
      startLeft = rect.left - parentRect.left;
      startTop = rect.top - parentRect.top;

      // Switch to left/top positioning
      element.style.right = 'auto';
      element.style.left = startLeft + 'px';
      element.style.top = startTop + 'px';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      element.style.left = (startLeft + deltaX) + 'px';
      element.style.top = (startTop + deltaY) + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  },

  /**
   * Helper function to determine marker specifications based on strategy event data.
   * @param {Object} eventData - The strategy event data
   * @returns {Object} Object containing shape, color, size, and price for the marker
   */
  getMarkerSpecification(eventData) {
    let shape = 'circle';
    let color = '#CCCCCC';
    let size = 1;
    let price = eventData.event_data?.entry_price || eventData.event_data?.current_price;
    let position = 'atPriceMiddle';

    if (eventData.position === 'OPEN') {

      // examples:
      // For an UP arrow where the tip looks ~6–8px below your target price:
      const tipUpAligned = price //this.priceWithPxOffset(state.candleSeries, price, -7);

      // For a DOWN arrow where the tip looks ~6–8px above your target price:
      const tipDownAligned = price //this.priceWithPxOffset(state.candleSeries, price, +7);

      size = 1.5;
      if (eventData.event_data.signal_direction === 'LONG') {
        price = tipUpAligned;
        shape = 'arrowUp';
        position = 'atPriceBottom';
        color = 'rgba(0, 255, 136, 1)'; // Green for LONG
      } else if (eventData.event_data.signal_direction === 'SHORT') {
        price = tipDownAligned;
        shape = 'arrowDown';
        position = 'atPriceTop';
        color = 'rgba(255, 68, 68, 1)'; // Red for SHORT
      }
    } else if (eventData.position === 'CLOSE') {
      price = eventData.event_data.current_price;
      const pnl = eventData.event_data.pnl;
      size = 1;
      if (pnl < 0) {
        shape = 'square';
        color = 'rgba(255,0,255,1)'; // Pink
      } else if (pnl > 0) {
        shape = 'square';
        color = 'rgba(173,255,47,1)'; // Gold
      } else {
        shape = 'square';
        color = 'rgba(192,192,192,1)'; // Grey
      }
    }

    return { shape, color, size, price, position };
  },


  priceWithPxOffset(series, price, px) {
    const y = series.priceToCoordinate(price);
    if (y == null) return price; // series not ready yet
    const y2 = y + px; // px > 0 moves marker DOWN; px < 0 moves UP
    return series.coordinateToPrice(y2) ?? price;
  },

  /**
   * Clears all strategy lines from the chart.
   */
  clearStrategyLines() {
    if (state.stopLossLine) {
      state.stopLossLine.hide();
    }
    if (state.targetLine) {
      state.targetLine.hide();
    }
    if (state.trailingStopActivationLine) {
      state.trailingStopActivationLine.hide();
    }
  },

  /**
   * Clears all strategy event markers from the chart.
   */
  clearStrategyMarkers() {
    if (state.strategyEventMarkers.length > 0) {
        state.strategyEventMarkers = [];
        state.strategyEventData.clear();
        this.updateAllMarkers();
    }
  },

  /**
   * Clears all strategy data (both lines and markers).
   */
  clearAllStrategyData() {
    this.clearStrategyLines();
    this.clearStrategyMarkers();
  },

  /**
   * Displays historic strategy events as markers on the chart.
   * @param {Array<Object>} events - An array of strategy event objects from the API.
   */
  displayStrategyMarkers(events) {
    // If there are no new events, ensure any old ones are cleared.
    if (!events || events.length === 0) {
      this.clearStrategyMarkers();
      return;
    }

    // Clear previous event data
    state.strategyEventData.clear();

    state.strategyEventMarkers = events.map(event => {
      const markerId = `strategy-${event.event_id}`;
      const { shape, color, size, position, price } = this.getMarkerSpecification(event);

      // Store the full event data for tooltip access
      state.strategyEventData.set(markerId, event);

      return {
        id: markerId,
        time: event.event_time,
        price: price,
        shape: shape,
        position: position,
        color: color,
        size: size,
      };
    });

    // Note: updateAllMarkers() is NOT called here
    // Caller is responsible for calling it at the appropriate time
    // This allows reloadData() to defer marker rendering until the end

    // Historic events are only used for markers, not strategy lines
    // Strategy lines are only displayed from live Redis data via canonical API
  },


  /**
   * Creates a strategy event marker from event data.
   * @param {Object} eventData - The strategy event data
   * @returns {Object} The marker object for the chart
   */
  createStrategyMarker(eventData) {

    const markerId = `strategy-${eventData.event_id}`;
    const { shape, color, size, position, price } = this.getMarkerSpecification(eventData);

    return {
      id: markerId,
      time: eventData.event_time,
      price: price,
      shape: shape,
      position: position,
      color: color,
      size: size,
    };
  },

  /**
   * Adds or updates a strategy event marker in real-time.
   * @param {Object} eventData - The strategy event data from WebSocket
   */
  addStrategyEventMarker(eventData) {
  try {
    // Initialize markers array if it doesn't exist
    if (!state.strategyEventMarkers) {
      state.strategyEventMarkers = [];
    }

    // Create the marker
    const newMarker = this.createStrategyMarker(eventData);

    // Store the full event data for tooltip access
    state.strategyEventData.set(newMarker.id, eventData);

    // Add or update the marker in the array
    const existingIndex = state.strategyEventMarkers.findIndex(m => m.id === newMarker.id);

    if (existingIndex >= 0) {
      state.strategyEventMarkers[existingIndex] = newMarker;
    } else {
      state.strategyEventMarkers.push(newMarker);
    }

    // Update the chart markers
    this.updateAllMarkers();

  } catch (error) {
    logger.error('Error adding strategy event marker', {
      ctx: ['Chart', 'Strategy'],
      error: error.message,
      stack: error.stack,
      eventData: eventData
    });
  }
  },

  /**
   */
  hideStopLossLine() {
    if (state.stopLossLine) {
      state.stopLossLine.hide();
    }
  },

  /**
   * Shows the stop loss line manually at a specific price
   * @param {number} stopPrice - The stop loss price
   * @param {string} [color] - Optional color for the line
   */
  showStopLossLine(stopPrice, color = '#FF4444') {
    if (state.stopLossLine) {
      state.stopLossLine.show(stopPrice, color);
    }
  },

  /**
   * Applies canonical strategy lines coming from the server endpoint.
   * Expects lines object with keys: SL, TP, TSA, TSL (numeric or -1 when absent).
   * @param {{SL:number, TP:number, TSA:number, TSL:number, updated_at?:string, seq?:number}} lines
   * @param {{ orphaned?: boolean, instance?: string|null, is_alive?: boolean, heartbeat_at?: string }} meta
   */
  applyCanonicalStrategyLines(lines, meta = {}) {
    try {
      const { SL = -1, TP = -1, TSA = -1, TSL = -1 } = lines || {};
      const orphaned = !!meta.orphaned;

      // Choose colors (gray when orphaned)
      const stopColor   = orphaned ? '#777777' : '#FF4444';
      const targetColor = orphaned ? '#888888' : '#00FF00';
      const tsaColor    = orphaned ? '#999999' : '#FFFF00';

      // Stop Loss (use TSL price and orange color when trailing is active)
      const isTrailing = Number.isFinite(TSL) && TSL > 0;
      const stopLossPrice = isTrailing ? TSL : SL;
      const actualStopColor = isTrailing ? (orphaned ? '#AA6600' : '#FFA500') : stopColor; // Orange when trailing


      if (Number.isFinite(stopLossPrice) && stopLossPrice > 0 && state.stopLossLine) {
        state.stopLossLine.show(stopLossPrice, actualStopColor, isTrailing);
      } else if (state.stopLossLine) {
        state.stopLossLine.hide();
      }

      // Target

      if (Number.isFinite(TP) && TP > 0 && state.targetLine) {
        state.targetLine.show(TP, targetColor);
      } else if (state.targetLine) {
        state.targetLine.hide();
      }

      // Trailing Stop Activation
      if (Number.isFinite(TSA) && TSA > 0 && state.trailingStopActivationLine) {
        state.trailingStopActivationLine.show(TSA, tsaColor);
      } else if (state.trailingStopActivationLine) {
        state.trailingStopActivationLine.hide();
      }
    } catch (error) {
      logger.error('Error applying canonical strategy lines', { error: error.message });
    }
  },

  /**
   * Updates the visual state of strategy lines based on orphaned status.
   * @param {boolean} isOrphaned - Whether the strategy is orphaned/unhealthy
   * @param {Object} metadata - Additional metadata about the strategy state
   */
  updateStrategyLinesOrphanedState(isOrphaned, metadata) {
    try {
      // Only update visual appearance, don't change line values
      // Apply grey colors when orphaned, restore original colors when healthy
      if (state.stopLossLine?.isVisible()) {
        const color = isOrphaned ? '#888888' : '#FF4444';
        state.stopLossLine.show(state.stopLossLine.getPrice(), color);
      }

      if (state.targetLine?.isVisible()) {
        const color = isOrphaned ? '#888888' : '#00FF00';
        state.targetLine.show(state.targetLine.getPrice(), color);
      }

      if (state.trailingStopActivationLine?.isVisible()) {
        const color = isOrphaned ? '#888888' : '#FFFF00';
        state.trailingStopActivationLine.show(state.trailingStopActivationLine.getPrice(), color);
      }
    } catch (error) {
      logger.error('Error updating strategy lines orphaned state', { error: error.message });
    }
  },
};
