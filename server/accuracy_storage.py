#!/usr/bin/env python3
"""
V4.32 Accuracy Storage System
Stores predictions and calculates historical accuracy
"""

import sqlite3
import json
from datetime import datetime, UTC
from pathlib import Path
from typing import Dict, Optional


class AccuracyStorage:
    """Simple storage for V4.32 predictions and accuracy tracking"""
    
    def __init__(self, db_path: str = "v4_accuracy.db"):
        self.db_path = Path(__file__).parent / db_path
        self.init_database()
    
    def init_database(self):
        """Initialize SQLite database"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Store daily anchors with original predictions
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS daily_anchors (
                anchor_date TEXT PRIMARY KEY,
                anchor_timestamp TEXT NOT NULL,
                anchor_price REAL NOT NULL,
                regime TEXT,
                direction TEXT,
                curve_quality REAL,
                created_at TEXT NOT NULL
            )
        ''')
        
        # Store predictions for each horizon
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anchor_date TEXT NOT NULL,
                horizon TEXT NOT NULL,
                original_price REAL NOT NULL,
                original_pct REAL NOT NULL,
                stabilized_price REAL,
                stabilized_pct REAL,
                actual_price REAL,
                actual_pct REAL,
                became_actual_at TEXT,
                UNIQUE(anchor_date, horizon),
                FOREIGN KEY(anchor_date) REFERENCES daily_anchors(anchor_date)
            )
        ''')
        
        # Store calculated accuracy metrics
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS accuracy_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                anchor_date TEXT NOT NULL,
                horizon TEXT NOT NULL,
                original_error_pct REAL NOT NULL,
                stabilized_error_pct REAL,
                original_accuracy REAL NOT NULL,
                stabilized_accuracy REAL,
                calculated_at TEXT NOT NULL,
                UNIQUE(anchor_date, horizon),
                FOREIGN KEY(anchor_date) REFERENCES daily_anchors(anchor_date)
            )
        ''')
        
        conn.commit()
        conn.close()
        print(f"✅ Accuracy database initialized: {self.db_path}")
    
    def store_v4_data(self, curve_data: Dict):
        """Store V4 curve data (predictions and actuals)"""
        if not curve_data:
            return
        
        anchor_timestamp = curve_data.get('anchor_timestamp')
        if not anchor_timestamp:
            return
        
        # Extract anchor date (YYYY-MM-DD)
        anchor_date = anchor_timestamp.split('T')[0]
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            # Store anchor info
            cursor.execute('''
                INSERT OR REPLACE INTO daily_anchors
                (anchor_date, anchor_timestamp, anchor_price, regime, direction, curve_quality, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                anchor_date,
                anchor_timestamp,
                curve_data.get('current_price', 0),
                curve_data.get('regime', 'UNKNOWN'),
                curve_data.get('direction', 'UNKNOWN'),
                curve_data.get('curve_quality', 0),
                datetime.now(UTC).isoformat()
            ))
            
            # Store predictions for each horizon
            # Match UI structure: curve_data has 'curve' array OR 'forward_curve' dict
            forward_curve = curve_data.get('curve', [])
            if not forward_curve:
                # Convert forward_curve dict to array format
                fc_dict = curve_data.get('forward_curve', {})
                forward_curve = [
                    {
                        'horizon': horizon,
                        'target_price': data.get('price'),
                        'pct_change': data.get('pct_change'),
                        'is_actual': data.get('is_actual', False)
                    }
                    for horizon, data in fc_dict.items()
                ]
            
            original_preds = curve_data.get('original_predictions', {})
            
            for point in forward_curve:
                horizon = point.get('horizon')
                if not horizon:
                    continue
                
                target_price = point.get('target_price', 0)
                pct_change = point.get('pct_change', 0)
                is_actual = point.get('is_actual', False)
                
                # Get original prediction
                orig = original_preds.get(horizon, {})
                original_price = orig.get('original_price')
                original_pct = orig.get('original_pct')
                stabilized_price = orig.get('stabilized_price')
                stabilized_pct = orig.get('stabilized_pct')
                
                # Only store if we have original prediction
                if original_price:
                    cursor.execute('''
                        INSERT OR REPLACE INTO predictions
                        (anchor_date, horizon, original_price, original_pct, 
                         stabilized_price, stabilized_pct, actual_price, actual_pct, became_actual_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        anchor_date,
                        horizon,
                        original_price,
                        original_pct,
                        stabilized_price,
                        stabilized_pct,
                        target_price if is_actual else None,
                        pct_change if is_actual else None,
                        datetime.now(UTC).isoformat() if is_actual else None
                    ))
                    
                    # Calculate accuracy if actual
                    if is_actual and target_price > 0:
                        original_error = abs(target_price - original_price)
                        original_error_pct = (original_error / target_price) * 100
                        original_accuracy = 100 - original_error_pct
                        
                        stabilized_error_pct = None
                        stabilized_accuracy = None
                        if stabilized_price:
                            stabilized_error = abs(target_price - stabilized_price)
                            stabilized_error_pct = (stabilized_error / target_price) * 100
                            stabilized_accuracy = 100 - stabilized_error_pct
                        
                        cursor.execute('''
                            INSERT OR REPLACE INTO accuracy_metrics
                            (anchor_date, horizon, original_error_pct, stabilized_error_pct,
                             original_accuracy, stabilized_accuracy, calculated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                        ''', (
                            anchor_date,
                            horizon,
                            original_error_pct,
                            stabilized_error_pct,
                            original_accuracy,
                            stabilized_accuracy,
                            datetime.now(UTC).isoformat()
                        ))
                        
                        print(f"✅ Stored accuracy: {anchor_date} {horizon} - {original_accuracy:.2f}%")
            
            conn.commit()
        except Exception as e:
            print(f"❌ Error storing V4 data: {e}")
            conn.rollback()
        finally:
            conn.close()
    
    def get_accuracy_summary(self, days: int = 30) -> Dict:
        """Get accuracy summary for last N days"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Overall accuracy by horizon
        cursor.execute('''
            SELECT 
                horizon,
                COUNT(*) as count,
                AVG(original_error_pct) as avg_error,
                MIN(original_error_pct) as min_error,
                MAX(original_error_pct) as max_error,
                AVG(original_accuracy) as avg_accuracy
            FROM accuracy_metrics
            WHERE calculated_at >= date('now', '-' || ? || ' days')
            GROUP BY horizon
            ORDER BY horizon
        ''', (days,))
        
        horizon_stats = {}
        for row in cursor.fetchall():
            horizon, count, avg_err, min_err, max_err, avg_acc = row
            horizon_stats[horizon] = {
                'count': count,
                'mape': round(avg_err, 3),
                'min_error': round(min_err, 3),
                'max_error': round(max_err, 3),
                'accuracy': round(avg_acc, 2)
            }
        
        # Overall MAPE
        cursor.execute('''
            SELECT AVG(original_error_pct) as overall_mape
            FROM accuracy_metrics
            WHERE calculated_at >= date('now', '-' || ? || ' days')
        ''', (days,))
        
        overall_mape = cursor.fetchone()[0] or 0
        
        # Accuracy by regime
        cursor.execute('''
            SELECT 
                da.regime,
                COUNT(*) as count,
                AVG(am.original_error_pct) as avg_error
            FROM accuracy_metrics am
            JOIN daily_anchors da ON am.anchor_date = da.anchor_date
            WHERE am.calculated_at >= date('now', '-' || ? || ' days')
            GROUP BY da.regime
            ORDER BY count DESC
        ''', (days,))
        
        regime_stats = {}
        for row in cursor.fetchall():
            regime, count, avg_err = row
            regime_stats[regime] = {
                'count': count,
                'mape': round(avg_err, 3)
            }
        
        conn.close()
        
        return {
            'overall_mape': round(overall_mape, 3),
            'overall_accuracy': round(100 - overall_mape, 2),
            'horizon_stats': horizon_stats,
            'regime_stats': regime_stats,
            'days_analyzed': days
        }
    
    def print_summary(self, days: int = 30):
        """Print accuracy summary"""
        summary = self.get_accuracy_summary(days)
        
        print("\n" + "="*80)
        print(f"V4.32 ACCURACY SUMMARY (Last {days} Days)")
        print("="*80)
        
        print(f"\n📊 Overall Performance:")
        print(f"   MAPE: {summary['overall_mape']:.3f}%")
        print(f"   Accuracy: {summary['overall_accuracy']:.2f}%")
        
        print(f"\n🎯 Accuracy by Horizon:")
        print(f"{'Horizon':<10} {'Samples':<10} {'MAPE':<12} {'Accuracy':<12} {'Range'}")
        print("-"*80)
        
        for horizon, stats in summary['horizon_stats'].items():
            print(f"{horizon:<10} {stats['count']:<10} {stats['mape']:>10.3f}%  "
                  f"{stats['accuracy']:>10.2f}%  {stats['min_error']:.3f}% - {stats['max_error']:.3f}%")
        
        if summary['regime_stats']:
            print(f"\n🎭 Accuracy by Regime:")
            print(f"{'Regime':<20} {'Samples':<10} {'MAPE'}")
            print("-"*50)
            
            for regime, stats in summary['regime_stats'].items():
                print(f"{regime:<20} {stats['count']:<10} {stats['mape']:>10.3f}%")
        
        print("="*80 + "\n")


if __name__ == "__main__":
    # Test the storage
    storage = AccuracyStorage()
    storage.print_summary(30)
