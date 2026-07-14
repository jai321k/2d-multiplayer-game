const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

// Room data-va store panna
let rooms = {}; // Example: { "MyRoom": { password: "123", players: { id: {x, y} } } }
let clientToRoom = {}; // Entha player entha room-la irukkanga nu kandupudikka

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 9);
    ws.id = playerId; // WebSocket object-laye ID-a save pandrom
    ws.send(JSON.stringify({ type: 'welcome', id: playerId }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Room Create Panrathu
            if (data.type === 'create_room') {
                if (rooms[data.room_name]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room already exists!' }));
                } else {
                    rooms[data.room_name] = { password: data.password || "", players: {} };
                    rooms[data.room_name].players[playerId] = { x: 0, y: 0, state: 'idle', flip_h: false };
                    clientToRoom[playerId] = data.room_name;
                    
                    ws.send(JSON.stringify({ type: 'room_created', room_name: data.room_name }));
                }
            }
            
            // 2. Room List Kekkurathu (Join pandravangalukku)
            else if (data.type === 'get_rooms') {
                const roomList = Object.keys(rooms).map(name => ({
                    name: name,
                    has_password: rooms[name].password !== "" // True/False tharum
                }));
                ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
            }
            
            // 3. Room-la Join Panrathu
            else if (data.type === 'join_room') {
                const room = rooms[data.room_name];
                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found!' }));
                    return;
                }
                if (room.password !== "" && room.password !== data.password) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Wrong Password!' }));
                    return;
                }
                
                // Password correct / illana join panna vidu
                room.players[playerId] = { x: 0, y: 0, state: 'idle', flip_h: false };
                clientToRoom[playerId] = data.room_name;

                ws.send(JSON.stringify({ type: 'join_success', room_name: data.room_name, players: room.players }));
                
                // Room-la ulla matha aalukku (Host-ku) ivana pathi sollanum
                broadcastToRoom(data.room_name, { type: 'player_joined', id: playerId, data: room.players[playerId] }, ws);
            }
            
            // 4. Position Update Panrathu (Antha room-la mattum anuppanum)
            else if (data.type === 'update_position') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    rooms[roomName].players[playerId] = { x: data.x, y: data.y, state: data.state, flip_h: data.flip_h };
                    broadcastToRoom(roomName, { type: 'update_position', id: playerId, data: rooms[roomName].players[playerId] }, ws);
                }
            }
        } catch (e) {
            console.log("Error:", e);
        }
    });

    // Player Disconnect aana
    ws.on('close', () => {
        const roomName = clientToRoom[playerId];
        if (roomName && rooms[roomName]) {
            delete rooms[roomName].players[playerId];
            broadcastToRoom(roomName, { type: 'player_left', id: playerId });
            
            // Room empty aagidicha nu check panni azhichidrom
            if (Object.keys(rooms[roomName].players).length === 0) {
                delete rooms[roomName];
            }
        }
        delete clientToRoom[playerId];
    });
});

// Antha specific room-la irukkavangalukku mattum message anuppum function
function broadcastToRoom(roomName, data, excludeWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN && clientToRoom[client.id] === roomName) {
            client.send(message);
        }
    });
}
