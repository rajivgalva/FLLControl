const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => { res.sendFile(__dirname + '/public/index.html'); });
app.get('/output', (req, res) => { res.sendFile(__dirname + '/public/output.html'); });
// NEW: Route for Referee View
app.get('/ref', (req, res) => { res.sendFile(__dirname + '/public/referee.html'); });

// --- STATE STORAGE ---
let lastKnownState = {
    timer: { seconds: 150, running: false },
    currentMatch: null,
    nextMatch: null,
    score: null,
    lowerThird: null,
    teamIntro: null,
    award: null,
    bg: '#0a0e17',
    schedule: [],
    currentMatchIndex: -1
};

// NEW: Match History for Ticker
let matchHistory = [];

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Send current state to newly connected Output/Control screens
    socket.emit('state-recover', lastKnownState);
    // NEW: Send history to newly connected clients
    socket.emit('history-update', matchHistory);

    // Listen for graphics updates (Control -> Output)
    socket.on('graphics-update', (msg) => {
        const { type, action, data } = msg;
        
        // Update Cache
        if (type === 'timer') lastKnownState.timer = data;
        else if (type === 'currentMatch') lastKnownState.currentMatch = action === 'show' ? data : null;
        else if (type === 'nextMatchInterstitial') lastKnownState.nextMatch = action === 'show' ? data : null;
        else if (type === 'score') lastKnownState.score = action === 'show' ? data : null;
        else if (type === 'lowerThird') lastKnownState.lowerThird = action === 'show' ? data : null;
        else if (type === 'teamIntro') lastKnownState.teamIntro = action === 'show' ? data : null;
        else if (type === 'award') lastKnownState.award = action === 'show' ? data : null;
        else if (type === 'setBackground') lastKnownState.bg = data.color;
        
        // Broadcast to everyone else
        socket.broadcast.emit('graphics-update', msg);
    });

    // --- SCHEDULE SYNC ---
    socket.on('set-schedule', (data) => {
        lastKnownState.schedule = data.schedule || [];
        lastKnownState.currentMatchIndex = data.currentMatchIndex ?? -1;
        // Push to every other connected client
        socket.broadcast.emit('schedule-update', {
            schedule: lastKnownState.schedule,
            currentMatchIndex: lastKnownState.currentMatchIndex
        });
    });

    socket.on('set-match-index', (index) => {
        lastKnownState.currentMatchIndex = index;
        socket.broadcast.emit('match-index-update', index);
    });

    // --- NEW: MATCH HISTORY LOGIC ---
    socket.on('commit-match', (matchData) => {
        // Add to history
        matchHistory.push(matchData);
        // Broadcast new history to everyone (for Ticker and Control Panel Log)
        io.emit('history-update', matchHistory);
    });

    socket.on('clear-history', () => {
        matchHistory = [];
        io.emit('history-update', matchHistory);
    });

    // --- NEW: REFEREE LOGIC ---
    // Referee requests current match info
    socket.on('get-ref-data', () => {
        if (lastKnownState.currentMatch) {
            socket.emit('ref-data-update', lastKnownState.currentMatch);
        }
    });

    // Referee submits scores
    socket.on('ref-submit-scores', (scores) => {
        // Forward these scores to the Control Panel
        io.emit('ref-score-update', scores);
    });
});

const PORT = process.env.PORT || 2000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
});