# Tambola Multiplayer Game - Quick Start Guide

## 🎮 How to Play

### Step 1: Start the Backend Server
```bash
cd backend
python server_multiplayer.py
```
Server will run on `http://localhost:8001`

### Step 2: Start the Frontend
```bash
cd frontend
npm start
# or
yarn start
```

### Step 3: Create an Account
1. Open the app
2. Sign up with email and password
3. Add money to wallet (for testing, any amount works)

### Step 4: Create a Room (Host)
1. Go to "Lobby" tab
2. Click "Create Room"
3. Configure:
   - Room name
   - Ticket price
   - Max/min players
   - Prize configuration
4. Click "Create"

### Step 5: Join Room (Players)
1. Go to "Lobby" tab
2. See available rooms
3. Click on a room to join
4. Purchase tickets (1-10 tickets)

### Step 6: Start Game (Host Only)
1. Wait for minimum players to join
2. Ensure all players have purchased tickets
3. Click "Start Game" button
4. Game begins - all players receive their tickets

### Step 7: Play the Game

#### For Host:
- **Call Number**: Click to call next random number
- **Auto Mode**: Automatically calls numbers every 5 seconds
- **Pause**: Pause the game (stops auto-calling)
- **Resume**: Resume the game
- **End Game**: Manually end game and show rankings
- **Sound Toggle**: Mute/unmute number announcements

#### For Players:
- **View Tickets**: Click ticket icon to see all your tickets
- **Auto-Mark**: Numbers are automatically marked when called
- **Manual Mark**: Tap any number to manually mark/unmark
- **Claim Prize**: Click "Claim" button when you complete a pattern
- **Sound Toggle**: Mute/unmute number announcements

### Step 8: Claim Prizes

When you complete a pattern:
1. Click "Claim" button on your ticket
2. Select the prize type (Early Five, Top Line, etc.)
3. System validates your claim
4. If valid, prize amount credited to wallet

### Step 9: Game End

Game ends when:
- All 90 numbers are called (automatic)
- Host clicks "End Game" (manual)

Winners modal shows:
- Final rankings
- Prize winners
- Amounts won

## 🎯 Prize Types

1. **Early Five**: First 5 numbers marked
2. **Top Line**: Complete top row
3. **Middle Line**: Complete middle row
4. **Bottom Line**: Complete bottom row
5. **Four Corners**: All 4 corner numbers
6. **Full House**: All numbers on ticket

## 🎨 Visual Indicators

### Number Board:
- **White**: Not called yet
- **Cyan**: Called number
- **Orange**: Current number (just called)

### Ticket:
- **Yellow**: Number not marked
- **Cyan**: Number marked
- **Orange**: Current number being called

### Game Status:
- **Green "Play" icon**: Game active
- **Orange "Pause" badge**: Game paused
- **Trophy icon**: View winners

## 🔊 Sound Features

- **TTS Announcements**: Numbers spoken when called
- **Toggle**: Click volume icon to mute/unmute
- **Auto-mute**: Sound stops when game paused

## ⏸️ Pause Feature

Host can pause game:
- Auto-calling stops
- Manual calling disabled
- Players notified
- Resume to continue

## 🏆 Winner Rankings

Rankings calculated by:
1. Prize type (Early Five first, Full House last)
2. Claim time (earlier claims rank higher)

## 💡 Tips

### For Hosts:
- Wait for all players to buy tickets before starting
- Use auto-mode for smooth gameplay
- Pause if you need a break
- End game manually if needed

### For Players:
- Buy tickets before game starts
- Watch for auto-marked numbers
- Claim prizes quickly (first claim wins)
- Keep sound on to hear numbers

## 🐛 Troubleshooting

### Tickets Not Showing:
- Ensure you purchased tickets before game started
- Refresh the room if needed
- Check socket connection

### Numbers Not Auto-Marking:
- Check internet connection
- Ensure socket is connected
- Refresh the game screen

### Can't Claim Prize:
- Verify pattern is complete
- Check if prize already claimed
- Ensure all marked numbers were actually called

### Sound Not Working:
- Check device volume
- Ensure sound toggle is ON
- Check browser permissions (web)

## 📱 Sharing

### Share Room:
1. Click share icon in room screen
2. Share room code with friends
3. Friends can join using code

### Share Board:
1. Click "Share Board" in game
2. Share called numbers list
3. Players can verify their tickets

### Share Prizes:
1. Click "Share Prizes" in game
2. Share prize pool details
3. Build excitement!

## 🎲 Game Modes

### Public Room:
- Anyone can join
- No password required
- Visible in lobby

### Private Room:
- Password protected
- Share room code
- Invite-only

## 💰 Wallet

- Add money before playing
- Ticket purchase deducts from wallet
- Prize winnings credited to wallet
- View transaction history

## 🔐 Security

- All claims validated server-side
- Host controls game flow
- Fair random number generation
- Secure prize distribution

## 📊 Statistics

Track your performance:
- Total games played
- Total wins
- Total winnings
- Win rate

## 🎉 Have Fun!

Enjoy playing Tambola with friends and family!
