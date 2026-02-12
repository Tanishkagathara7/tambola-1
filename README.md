# Tambola Multiplayer Game

A full-stack multiplayer Tambola (Housie/Bingo) game built with FastAPI, Socket.IO, React Native, and MongoDB.

## 🎯 Features

### Game Features
- ✅ Real-time multiplayer gameplay
- ✅ Automatic ticket generation with valid Tambola rules
- ✅ Multiple prize categories (Early 5, Lines, Corners, Full House)
- ✅ Live number calling with auto-marking
- ✅ Prize claiming with server-side validation
- ✅ Dynamic prize pool based on ticket sales
- ✅ Chat functionality in game rooms

### User Features
- ✅ User authentication (signup/login with JWT)
- ✅ Points-based wallet system
- ✅ Transaction history
- ✅ Ad rewards for free points
- ✅ User profile and statistics

### Room Features
- ✅ Public and private rooms
- ✅ Customizable prize configurations
- ✅ Host controls (start, pause, end game)
- ✅ Admin winner selection (for host advantage)
- ✅ Room cleanup for old/empty rooms

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI
- **Real-time**: Socket.IO (python-socketio)
- **Database**: MongoDB (Motor async driver)
- **Authentication**: JWT (python-jose)
- **Password Hashing**: Passlib with Argon2

### Frontend
- **Framework**: React Native (Expo)
- **Navigation**: Expo Router
- **Real-time**: Socket.IO Client
- **State Management**: React Context
- **Storage**: AsyncStorage

## 📋 Prerequisites

- Python 3.12+ (tested with 3.12.12)
- Node.js 18+ and npm/yarn
- MongoDB Atlas account or local MongoDB instance

## 🚀 Quick Start

### Option 1: Automated Setup (Windows)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd tambola
   ```

2. **Install dependencies and start**
   ```bash
   start_project.bat
   ```
   This will:
   - Check Python and Node.js installations
   - Start the backend server on port 8001
   - Start the frontend app on port 8081

### Option 2: Manual Setup

#### Backend Setup

1. **Navigate to backend directory**
   ```bash
   cd backend
   ```

2. **Install Python dependencies**
   ```bash
   # Windows
   install_dependencies.bat
   
   # Linux/Mac
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   
   Edit `backend/.env`:
   ```env
   MONGO_URL="your-mongodb-connection-string"
   DB_NAME="tambola_multiplayer"
   SECRET_KEY="your-secret-key-min-32-chars"
   ```

4. **Start the backend server**
   ```bash
   # Multiplayer server (recommended)
   python server_multiplayer.py
   
   # Single player server (legacy)
   python server.py
   ```
   
   Server will run on: `http://localhost:8001`

#### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install Node dependencies**
   ```bash
   npm install
   # or
   yarn install
   ```

3. **Configure environment variables**
   
   Edit `frontend/.env`:
   ```env
   EXPO_PUBLIC_BACKEND_URL=http://localhost:8001
   ```
   
   For production, use your deployed backend URL:
   ```env
   EXPO_PUBLIC_BACKEND_URL=https://your-backend.com
   ```

4. **Start the Expo app**
   ```bash
   npm start
   # or
   yarn start
   ```
   
   App will run on: `http://localhost:8081`

5. **Run on device/emulator**
   - Press `a` for Android emulator
   - Press `i` for iOS simulator
   - Scan QR code with Expo Go app on physical device

## 📁 Project Structure

```
tambola/
├── backend/
│   ├── server.py                    # Single player server
│   ├── server_multiplayer.py        # Multiplayer server (main)
│   ├── models.py                    # Pydantic models
│   ├── auth.py                      # JWT authentication
│   ├── socket_handlers.py           # Socket.IO event handlers
│   ├── migrate_wallets.py           # Database migration script
│   ├── requirements.txt             # Python dependencies
│   ├── requirements-multiplayer.txt # Additional multiplayer deps
│   ├── .env                         # Environment configuration
│   └── install_dependencies.bat     # Dependency installer
├── frontend/
│   ├── app/                         # Expo Router screens
│   │   ├── (tabs)/                  # Tab navigation screens
│   │   ├── auth/                    # Authentication screens
│   │   ├── room/                    # Game room screens
│   │   └── ...                      # Other screens
│   ├── services/                    # API and Socket services
│   ├── contexts/                    # React contexts
│   ├── utils/                       # Utility functions
│   ├── assets/                      # Images and fonts
│   ├── package.json                 # Node dependencies
│   └── .env                         # Frontend configuration
├── tests/                           # Test files
├── FIXES_APPLIED.md                 # Documentation of fixes
├── README.md                        # This file
└── start_project.bat                # Project launcher (Windows)
```

## 🎮 How to Play

1. **Sign Up / Login**
   - Create an account or login
   - Get 50 free points as welcome bonus

2. **Join or Create a Room**
   - Browse public rooms or create your own
   - Set ticket price and prize configurations
   - Invite friends with room code (for private rooms)

3. **Buy Tickets**
   - Purchase tickets using your points balance
   - Each ticket has 15 unique numbers in a 3x9 grid

4. **Play the Game**
   - Host starts the game
   - Numbers are called automatically or manually
   - Your tickets are auto-marked when numbers are called

5. **Claim Prizes**
   - Tap "Claim" when you complete a prize pattern
   - Server validates your claim
   - Win points added to your wallet instantly

6. **Prize Categories**
   - **Early 5**: First to mark 5 numbers
   - **Top Line**: Complete top row
   - **Middle Line**: Complete middle row
   - **Bottom Line**: Complete bottom row
   - **Four Corners**: Mark all 4 corner numbers
   - **Full House**: Mark all 15 numbers

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile

### Rooms
- `GET /api/rooms` - List available rooms
- `POST /api/rooms/create` - Create new room
- `GET /api/rooms/{room_id}` - Get room details
- `POST /api/rooms/{room_id}/join` - Join a room

### Tickets
- `POST /api/tickets/buy` - Purchase tickets
- `GET /api/tickets/my-tickets/{room_id}` - Get user's tickets

### Game
- `POST /api/game/{room_id}/start` - Start game (host only)
- `POST /api/game/{room_id}/call-number` - Call a number
- `POST /api/game/{room_id}/claim` - Claim a prize

### Wallet
- `GET /api/wallet/balance` - Get points balance
- `POST /api/wallet/add-money` - Add money to wallet
- `GET /api/wallet/transactions` - Transaction history

## 🔌 Socket.IO Events

### Client → Server
- `authenticate` - Authenticate user
- `join_room` - Join game room
- `leave_room` - Leave game room
- `call_number` - Call a number (host)
- `claim_prize` - Claim a prize
- `chat_message` - Send chat message
- `start_game` - Start game (host)
- `pause_game` - Pause/resume game (host)
- `end_game` - End game (host)

### Server → Client
- `connected` - Connection established
- `authenticated` - Authentication successful
- `room_joined` - Successfully joined room
- `player_joined` - Another player joined
- `player_left` - Player left room
- `game_started` - Game has started
- `number_called` - New number called
- `ticket_updated` - Ticket auto-marked
- `prize_claimed` - Prize claimed by player
- `game_completed` - Game finished
- `points_updated` - Points balance updated
- `error` - Error occurred

## 🐛 Troubleshooting

### Backend Issues

**Import errors**
```bash
# Reinstall dependencies
cd backend
pip install -r requirements.txt --force-reinstall
```

**MongoDB connection failed**
- Check your MongoDB connection string in `.env`
- Ensure your IP is whitelisted in MongoDB Atlas
- Verify database name is correct

**Port already in use**
- Change port in `server_multiplayer.py`:
  ```python
  uvicorn.run("server_multiplayer:socket_app", host="0.0.0.0", port=8002)
  ```

### Frontend Issues

**Cannot connect to backend**
- Verify backend is running
- Check `EXPO_PUBLIC_BACKEND_URL` in `frontend/.env`
- For physical device, use your computer's IP address instead of localhost

**Module not found**
```bash
# Clear cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Expo Go connection issues**
- Ensure device and computer are on same network
- Try tunnel mode: `npm start -- --tunnel`

## 📝 Recent Fixes

All critical errors have been fixed. See [FIXES_APPLIED.md](FIXES_APPLIED.md) for details:

- ✅ Fixed syntax error in models.py (regex pattern)
- ✅ Fixed missing timedelta import in server_multiplayer.py
- ✅ Resolved pydantic version conflicts (v1 vs v2)
- ✅ Fixed bcrypt version conflict
- ✅ Added missing cryptography extras for python-jose
- ✅ All Python files compile successfully
- ✅ No syntax or import errors

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- FastAPI for the excellent async framework
- Socket.IO for real-time communication
- Expo for React Native development
- MongoDB for the database

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review [FIXES_APPLIED.md](FIXES_APPLIED.md)
3. Open an issue on GitHub

---

**Status**: ✅ All errors fixed. Ready to run!

**Last Updated**: 2026-02-12
