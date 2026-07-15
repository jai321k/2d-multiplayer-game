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

            // 1. Create Room
            if (data.type === 'create_room') {
                if (rooms[data.room_name]) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room already exists!' }));
                } else {
                    rooms[data.room_name] = { 
                        password: data.password || "", 
                        players: {}, 
                        started: false 
                    };
                    rooms[data.room_name].players[playerId] = { x: 0, y: 0, state: data.char_id + '_idle', flip_h: false };
                    clientToRoom[playerId] = data.room_name;
                    ws.send(JSON.stringify({ type: 'room_created', room_name: data.room_name }));
                }
            }
            
            // 2. Get Rooms (Filters started and full rooms)
            else if (data.type === 'get_rooms') {
                const roomList = Object.keys(rooms)
                    .filter(name => !rooms[name].started && Object.keys(rooms[name].players).length < 2) 
                    .map(name => ({
                        name: name,
                        has_password: rooms[name].password !== "" 
                    }));
                ws.send(JSON.stringify({ type: 'room_list', rooms: roomList }));
            }
            
            // 3. Join Room
            else if (data.type === 'join_room') {
                const room = rooms[data.room_name];
                
                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found!' }));
                    return;
                }
                
                if (room.started) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game already started!' }));
                    return;
                }
                
                if (Object.keys(room.players).length >= 2) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is Full!' }));
                    return;
                }

                if (room.password !== "" && room.password !== data.password) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Wrong Password!' }));
                    return;
                }
                
                room.players[playerId] = { x: 0, y: 0, state: data.char_id + '_idle', flip_h: false };
                clientToRoom[playerId] = data.room_name;

                ws.send(JSON.stringify({ type: 'join_success', room_name: data.room_name, players: room.players }));
                broadcastToRoom(data.room_name, { type: 'player_joined', id: playerId, data: room.players[playerId] }, ws);

                if (Object.keys(room.players).length === 2) {
                    room.started = true; 
                    broadcastToRoom(data.room_name, { type: 'start_game' }); 
                }
            }
            
            // 4. Update Position
            else if (data.type === 'update_position') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    rooms[roomName].players[playerId] = { x: data.x, y: data.y, state: data.state, flip_h: data.flip_h };
                    broadcastToRoom(roomName, { type: 'update_position', id: playerId, data: rooms[roomName].players[playerId] }, ws);
                }
            }
            
            // 5. Update Box
            else if (data.type === 'update_box') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    broadcastToRoom(roomName, { type: 'update_box', x: data.x, y: data.y }, ws);
                }
            }

            // 6. Restart Level
            else if (data.type === 'restart_level') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    broadcastToRoom(roomName, { type: 'restart_level' });
                }
            }

            // 7. Leave Room
            else if (data.type === 'leave_room') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    delete rooms[roomName].players[playerId]; 
                    broadcastToRoom(roomName, { type: 'player_left', id: playerId });
                    
                    if (Object.keys(rooms[roomName].players).length === 0) {
                        delete rooms[roomName]; 
                    }
                }
                delete clientToRoom[playerId]; 
            }

            // 8. Endpoint Trigger (PUDHUSU)
            else if (data.type === 'activate_endpoint') {
                const roomName = clientToRoom[playerId];
                if (roomName && rooms[roomName]) {
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN && clientToRoom[client.id] === roomName) {
                            client.send(JSON.stringify({ 
                                type: 'endpoint_activated', 
                                endpoint_name: data.endpoint_name 
                            }));
                        }
                    });
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
