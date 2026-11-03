const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const MAX_MESSAGES = 100;

function pushMessage(roomId, msg) {
    const room = rooms[roomId];
    if (!room) return msg;
    msg.time = Date.now();
    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGES) room.messages.shift();
    return msg;
}

io.on('connection', (socket) => {
    
    socket.on('createRoom', (password, callback) => {
        const roomId = Math.random().toString(36).substring(2, 8);
        rooms[roomId] = {
            password: password, videoId: null, time: 0, hostId: socket.id, freeControl: true,
            updatedAt: Date.now(), isPlaying: false, messages: [], users: {}
        };
        callback(roomId);
    });

    socket.on('joinRoom', ({ roomId, password, username }, callback) => {
        const room = rooms[roomId];
        if (!room) return callback({ success: false, message: 'Böyle bir oda bulunamadı.' });
        if (room.password !== password) return callback({ success: false, message: 'Hatalı şifre!' });

        socket.join(roomId);
        socket.username = username;
        socket.roomId = roomId;

        room.users[socket.id] = { username: username, isMicOn: false, isCamOn: false };
        
        // Eğer odada kimse yoksa veya mevcut host çıkmışsa, giren kişi host olur
        if (Object.keys(room.users).length === 1 || !room.users[room.hostId]) {
            room.hostId = socket.id;
        }
        room.users[socket.id].isHost = (room.hostId === socket.id);

        let currentRealTime = room.time;
        if (room.isPlaying) currentRealTime += (Date.now() - room.updatedAt) / 1000;

        callback({ success: true, videoId: room.videoId, time: currentRealTime, isPlaying: room.isPlaying, messages: room.messages, hostId: room.hostId, myId: socket.id, freeControl: room.freeControl });

        const sysMsg = pushMessage(roomId, { user: 'Sistem', text: `${username} odaya katıldı.`, color: '#00CED1' });
        io.to(roomId).emit('message', sysMsg);
        socket.to(roomId).emit('user-joined', socket.id, username);
        io.to(roomId).emit('update-users', room.users);
    });

    socket.on('mediaState', (state) => {
        if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].users[socket.id]) {
            const user = rooms[socket.roomId].users[socket.id];
            user.isMicOn = !!state.isMicOn;
            user.isCamOn = !!state.isCamOn;
            user.isScreenSharing = !!state.isScreenSharing;
            // İstemci, gelen akışın kamera mı ekran mı olduğunu bu kimliklerden anlar
            user.camStreamId = typeof state.camStreamId === 'string' ? state.camStreamId : null;
            user.screenStreamId = typeof state.screenStreamId === 'string' ? state.screenStreamId : null;
            io.to(socket.roomId).emit('update-users', rooms[socket.roomId].users);
        }
    });

    socket.on('signal', (toId, message) => { io.to(toId).emit('signal', socket.id, message); });

    socket.on('chatMessage', (msg) => {
        if (socket.roomId && rooms[socket.roomId]) {
            if (typeof msg !== 'string' || !msg.trim()) return;
            const msgData = pushMessage(socket.roomId, { user: socket.username, text: msg.slice(0, 2000), color: '#40E0D0' });
            io.to(socket.roomId).emit('message', msgData);
        }
    });

    socket.on('loadVideo', (videoId) => {
        if (typeof videoId !== 'string' || !/^[\w-]{11}$/.test(videoId)) return;
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            if (rooms[socket.roomId].hostId !== socket.id && !rooms[socket.roomId].freeControl) return;
            rooms[socket.roomId].videoId = videoId; rooms[socket.roomId].time = 0;
            rooms[socket.roomId].updatedAt = Date.now(); rooms[socket.roomId].isPlaying = true;
            io.to(socket.roomId).emit('videoChange', videoId);
            
            // Sohbet Geçmişine Ekle (Video başlığını YouTube oEmbed ile çek)
            const https = require('https');
            https.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let title = '';
                    try { title = JSON.parse(data).title; } catch(e) {}
                    const sysMsg = pushMessage(roomId, { user: 'Sistem', text: `Şu an oynatılıyor: ${title ? title + ' - ' : ''}https://youtu.be/${videoId}`, color: '#ffb703' });
                    io.to(roomId).emit('message', sysMsg);
                });
            }).on('error', () => {
                const sysMsg = pushMessage(roomId, { user: 'Sistem', text: `Şu an oynatılıyor: https://youtu.be/${videoId}`, color: '#ffb703' });
                io.to(roomId).emit('message', sysMsg);
            });
        }
    });

    socket.on('playVideo', (time) => {
        if (socket.roomId && rooms[socket.roomId]) {
            if (rooms[socket.roomId].hostId !== socket.id && !rooms[socket.roomId].freeControl) return;
            rooms[socket.roomId].time = time; rooms[socket.roomId].updatedAt = Date.now(); rooms[socket.roomId].isPlaying = true;
            socket.to(socket.roomId).emit('videoPlay', time);
        }
    });

    socket.on('pauseVideo', (time) => {
        if (socket.roomId && rooms[socket.roomId]) {
            if (rooms[socket.roomId].hostId !== socket.id && !rooms[socket.roomId].freeControl) return;
            rooms[socket.roomId].time = time; rooms[socket.roomId].updatedAt = Date.now(); rooms[socket.roomId].isPlaying = false;
            socket.to(socket.roomId).emit('videoPause');
        }
    });
    
    socket.on('reaction', (emoji) => {
        if (socket.roomId && rooms[socket.roomId]) {
            io.to(socket.roomId).emit('reaction', { emoji: emoji, fromId: socket.id, username: socket.username });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username && socket.roomId && rooms[socket.roomId]) {
            const room = rooms[socket.roomId];
            delete room.users[socket.id];
            const sysMsg = pushMessage(socket.roomId, { user: 'Sistem', text: `${socket.username} ayrıldı.`, color: '#008B8B' });
            socket.to(socket.roomId).emit('message', sysMsg);
            socket.to(socket.roomId).emit('user-left', socket.id);

            // Yönetici çıktıysa odada kalan ilk kişi yönetici olur
            const remaining = Object.keys(room.users);
            if (room.hostId === socket.id && remaining.length) {
                room.hostId = remaining[0];
                remaining.forEach(id => { room.users[id].isHost = (id === room.hostId); });
                io.to(socket.roomId).emit('hostChanged', room.hostId);
                const hostMsg = pushMessage(socket.roomId, { user: 'Sistem', text: `${room.users[room.hostId].username} artık oda yöneticisi.`, color: '#ffb703' });
                io.to(socket.roomId).emit('message', hostMsg);
            }
            io.to(socket.roomId).emit('update-users', room.users);
        }
    });
    socket.on("toggleFreeControl", () => {
        if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].hostId === socket.id) {
            rooms[socket.roomId].freeControl = !rooms[socket.roomId].freeControl;
            io.to(socket.roomId).emit("roomControlChanged", rooms[socket.roomId].freeControl);
        }
    });

    socket.on("forceMute", (targetId) => {
        if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].hostId === socket.id) {
            io.to(targetId).emit("forceMute");
        }
    });

    socket.on("forceCamOff", (targetId) => {
        if (socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].hostId === socket.id) {
            io.to(targetId).emit("forceCamOff");
        }
    });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Sunucu çalışıyor`));
