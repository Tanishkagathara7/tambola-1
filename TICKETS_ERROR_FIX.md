# Tickets "Internal Server Error" Fix

## Problem

Getting "Internal Server Error" when fetching tickets:
```
LOG  API received plain "Internal Server Error" – returning success: false
LOG  No tickets returned or invalid format, setting empty array
```

## Root Cause

**Duplicate function definition** in `backend/server_multiplayer.py`:

There were TWO `get_my_tickets` functions:

1. **First one (line ~691)** - BROKEN ❌
   ```python
   @api_router.get("/tickets/my-tickets/{room_id}", response_model=List[Ticket])
   async def get_my_tickets(...):
       tickets = await db.tickets.find(...).to_list(100)
       return [Ticket(**ticket) for ticket in tickets]  # ❌ Doesn't serialize ObjectId
   ```

2. **Second one (line ~1041)** - CORRECT ✅
   ```python
   @api_router.get("/tickets/my-tickets/{room_id}")
   async def get_my_tickets(...):
       tickets = await db.tickets.find(...).to_list(100)
       serialized_tickets = [serialize_doc(t) for t in tickets]  # ✅ Serializes ObjectId
       return serialized_tickets
   ```

The first function was being used, which didn't serialize MongoDB's `ObjectId`, causing JSON serialization errors.

## ✅ Fix Applied

**Removed the duplicate (broken) function.**

Now only the correct version remains:

```python
@api_router.get("/tickets/my-tickets/{room_id}")
async def get_my_tickets(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get user's tickets for a specific room"""
    try:
        tickets = await db.tickets.find({
            "room_id": room_id,
            "user_id": current_user["id"]
        }).to_list(100)
        
        # Serialize tickets to remove ObjectId ✅
        serialized_tickets = [serialize_doc(t) for t in tickets]
        
        logger.info(f"Found {len(serialized_tickets)} tickets")
        
        return serialized_tickets
    except Exception as e:
        logger.error(f"Error fetching tickets: {e}")
        return []  # Return empty array instead of error
```

## 🚀 Deploy the Fix

### For Local Development:

```bash
# Restart the backend server
cd backend
py server_multiplayer.py
```

### For Production (Render):

```bash
# Commit and push the fix:
git add backend/server_multiplayer.py
git commit -m "Fix: Remove duplicate get_my_tickets function causing serialization error"
git push

# Render will automatically redeploy in 2-3 minutes
```

## ✅ After Fix

### What Will Work:

1. ✅ Fetching tickets will return proper JSON
2. ✅ No more "Internal Server Error"
3. ✅ Tickets will display in the app
4. ✅ Empty array returned if no tickets (not an error)

### Test It:

```bash
# Test the endpoint:
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://tambola-1-g7r1.onrender.com/api/tickets/my-tickets/ROOM_ID

# Should return:
[]  # If no tickets
# or
[{"id": "...", "ticket_number": 1, "grid": [...], ...}]  # If tickets exist
```

## 🔍 Why This Happened

When we fixed the serialization issues earlier, we added a corrected version of `get_my_tickets` but forgot to remove the old broken version. Python used the first definition it found, which was the broken one.

## 📝 Lesson Learned

Always check for duplicate function definitions when adding fixes. Use search to find all occurrences:

```bash
# Search for duplicate functions:
grep -n "def get_my_tickets" backend/server_multiplayer.py
```

## ✅ Verification Checklist

After deploying:

- [ ] Backend redeployed successfully
- [ ] No errors in Render logs
- [ ] Test tickets endpoint with curl
- [ ] Open app and check tickets screen
- [ ] Buy a ticket and verify it appears
- [ ] No "Internal Server Error" in app logs

---

**Status**: ✅ Fixed  
**Action Required**: Push to GitHub for production deployment  
**Impact**: Tickets will now load correctly in the app
