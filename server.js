const WebSocket = require('ws');
const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

let rooms = {}; 
let clientToRoom = {}; 

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 9);
    ws.id = playerId; 
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
            
            // 2. Room List Kekkurathu
            else if (data.type === 'get_rooms') {
                const roomList = Object.keys(rooms).map(name => ({
                    name: name,
                    has_password: rooms[name].password !== "" 
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
                
                // Room full aagidicha nu check pandrom (Max 2 Players)
                if (Object.keys(room.players).length >= 2) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is Full!' }));
                    return;
                }

                if (room.password !== "" && room.password !== data.password) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Wrong Password!' }));
                    return;
                }
                
                room.players[playerId] = { x: 0, y: 0, state: 'idle', flip_h: false };
                clientToRoom[playerId] = data.room_name;

                ws.send(JSON.stringify({ type: 'join_success', room_name: data.room_name, players: room.players }));
                broadcastToRoom(data.room_name, { type: 'player_joined', id: playerId, data: room.players[playerId] }, ws);

                // Room-la 2 per vanthuttangala nu check panni 'start_game' anuppurom
                if (Object.keys(room.players).length === 2) {
                    broadcastToRoom(data.room_name, { type: 'start_game' }); 
                }
            }
            
            // 4. Position Update Panrathu
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

    ws.on('close', () => {
        const roomName = clientToRoom[playerId];
        if (roomName && rooms[roomName]) {
            delete rooms[roomName].players[playerId];
            broadcastToRoom(roomName, { type: 'player_left', id: playerId });
            
            if (Object.keys(rooms[roomName].players).length === 0) {
                delete rooms[roomName];
            }
        }
        delete clientToRoom[playerId];
    });
});

function broadcastToRoom(roomName, data, excludeWs = null) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN && clientToRoom[client.id] === roomName) {
            client.send(message);
        }
    });
}
