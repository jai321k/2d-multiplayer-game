const WebSocket = require('ws');

// Render.com auto-a oru PORT assign pannum, illana local-la 10000 use aagum
const PORT = process.env.PORT || 10000; 
const wss = new WebSocket.Server({ port: PORT });

let players = {}; // Game-la irukka ellaroda data-vaiyum store panna

wss.on('connection', (ws) => {
    // Pudhu player connect aana, avangalukku oru random ID assign panrom
    const playerId = Math.random().toString(36).substring(2, 9);
    players[playerId] = { x: 0, y: 0, state: 'idle', flip_h: false };
    
    console.log(`Player Connected: ${playerId}`);

    // 1. Connect aana player-ku avanga ID-a anuppurom
    ws.send(JSON.stringify({ type: 'welcome', id: playerId }));

    // 2. Already irukka players-oda data-va pudhu player-ku anuppurom
    ws.send(JSON.stringify({ type: 'current_players', players: players }));

    // 3. Matha ellarukkum "Pudhu player vanthurukkan" nu solrom
    broadcast({ type: 'player_joined', id: playerId, data: players[playerId] }, ws);

    // Player kitta irunthu message varum pothu (Movement & Animation updates)
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'update_position') {
                // Server-la player data-va update panrom
                players[playerId].x = data.x;
                players[playerId].y = data.y;
                players[playerId].state = data.state;
                players[playerId].flip_h = data.flip_h;
                
                // Update aana position-a MATHA ellarukkum anuppurom
                broadcast({ type: 'update_position', id: playerId, data: players[playerId] }, ws);
            }
        } catch (e) {
            console.log("Invalid message format", e);
        }
    });

    // Player game-a vittu pogum pothu
    ws.on('close', () => {
        console.log(`Player Disconnected: ${playerId}`);
        delete players[playerId];
        broadcast({ type: 'player_left', id: playerId }); // Matha ellarukkum theriyapaduthurom
    });
});

// Helper Function: Ellarukkum message anuppa (Exclude pannavangala thavira)
function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

console.log(`WebSocket server is running on port ${PORT}`);
