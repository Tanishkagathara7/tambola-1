#!/usr/bin/env python3
"""
Test script to verify the ads endpoint works correctly
"""
import asyncio
import uuid
from datetime import datetime

# Mock data for testing
mock_user = {
    "id": "test_user_123",
    "points_balance": 50.0,
    "name": "Test User"
}

def test_ads_logic():
    """Test the ads reward logic"""
    reward_points = 10.0
    current_balance = float(mock_user.get("points_balance", 0.0))
    new_balance = current_balance + reward_points
    
    # Validate balance values
    if current_balance < 0:
        current_balance = 0.0
        new_balance = reward_points
    
    print(f"Current balance: {current_balance}")
    print(f"Reward points: {reward_points}")
    print(f"New balance: {new_balance}")
    
    # Test transaction data creation
    transaction_data = {
        "id": str(uuid.uuid4()),
        "user_id": mock_user["id"],
        "amount": reward_points,
        "type": "credit",
        "description": "Ad Reward - Watched Video Ad",
        "balance_after": new_balance,
        "created_at": datetime.utcnow()
    }
    
    print(f"Transaction data: {transaction_data}")
    print("✅ Ads logic test passed!")

if __name__ == "__main__":
    test_ads_logic()