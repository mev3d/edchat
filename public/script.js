const socket = io();

// Yardımcılar
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(msg, type = 'info') {
    const t = document.createElement('div'); t.className = 'toast ' + type;
    t.innerHTML = `<i class="fas ${type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-info'}"></i><span></span>`;
    t.lastChild.textContent = msg; document.getElementById('toast-root').appendChild(t);
    setTimeout(() => t.classList.add('out'), 2800); setTimeout(() => t.remove(), 3200);
}
function setBusy(btn, busy, label) {
    if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
    btn.disabled = busy; btn.innerHTML = busy ? `<i class="fas fa-circle-notch fa-spin"></i> ${label}` : btn.dataset.label;
}
let myUsername = '';

// UI Elementleri
const createScreen = document.getElementById('create-screen');
const passwordScreen = document.getElementById('password-screen');
const mainScreen = document.getElementById('main-screen');
const newRoomPassInput = document.getElementById('new-room-pass');
const createBtn = document.getElementById('create-btn');
const joinUsername = document.getElementById('join-username');
const joinPassword = document.getElementById('join-password');
const joinBtn = document.getElementById('join-btn');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');
const ytUrlInput = document.getElementById('youtube-url');
const loadBtn = document.getElementById('load-btn');
const copyLinkBtn = document.getElementById('copy-link-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Sohbet Baloncuğu
const chatToggleBtn = document.getElementById('chat-toggle-btn');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatPanel = document.getElementById('chat-panel');
const unreadBadge = document.getElementById('unread-badge');
const unreadBadgeDesktop = document.getElementById('unread-badge-desktop');
const chatHeaderBtn = document.getElementById('chat-header-btn');
let unreadCount = 0;
let dragHasMovedChat = false;
function setUnread(n) {
    unreadCount = n;
    [unreadBadge, unreadBadgeDesktop].forEach(b => { b.innerText = n; b.classList.toggle('hidden', !n); });
}
function openChat() {
    if (typeof placeChatPanel === 'function') placeChatPanel();
    chatPanel.classList.remove('chat-closed'); chatHeaderBtn.classList.add('active'); setUnread(0); chatMessages.scrollTop = chatMessages.scrollHeight;
    if (window.innerWidth > 900) msgInput.focus();
}
function closeChat() { chatPanel.classList.add('chat-closed'); chatHeaderBtn.classList.remove('active'); }
chatToggleBtn.addEventListener('click', (e) => {
    if (dragHasMovedChat) return;
    if (chatPanel.classList.contains('chat-closed')) openChat(); else closeChat();
});
chatHeaderBtn.addEventListener('click', () => { if (chatPanel.classList.contains('chat-closed')) openChat(); else closeChat(); });
chatCloseBtn.addEventListener('click', closeChat);

let player; let isUserAction = true; let currentRoomId = null; let myId = null; let currentHostId = null; let isFreeControl = false;
const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('oda');
if (roomParam) {
    currentRoomId = roomParam; passwordScreen.classList.remove('hidden');
    document.getElementById('room-code-label').textContent = roomParam;
    try {
        joinUsername.value = localStorage.getItem('lesa_username') || '';
        const savedPass = sessionStorage.getItem('lesa_pass_' + roomParam);
        if (savedPass) joinPassword.value = savedPass;
    } catch (e) {}
    (joinUsername.value ? (joinPassword.value ? joinBtn : joinPassword) : joinUsername).focus();
}
else { createScreen.classList.remove('hidden'); newRoomPassInput.focus(); }

let lastMsgUser = null;
function renderEmptyChat() { chatMessages.innerHTML = '<div class="chat-empty"><i class="fas fa-comments"></i>Henüz mesaj yok.<br>Selam ver! 👋</div>'; lastMsgUser = null; }
function formatClock(t) { return t ? new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : ''; }
function linkify(html) { return html.replace(/(\bhttps?:\/\/[^\s<]+)/gi, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`); }

function appendMessage(data, fromHistory) {
    const empty = chatMessages.querySelector('.chat-empty'); if (empty) empty.remove();
    const div = document.createElement('div');
    div.classList.add('message');
    const text = String(data.text || '');
    const isSystem = data.user === 'Sistem';
    const mine = !isSystem && data.user === myUsername;

    const match = text.match(/(?:youtu\.be\/|\/embed\/|watch\?v=|&v=)([\w-]{11})/);
    const playBtnHtml = match ? `<button type="button" class="play-chip" data-vid="${match[1]}"><i class="fas fa-play"></i> Oynat</button>` : '';
    const meta = data.time ? `<span class="meta">${formatClock(data.time)}</span>` : '';

    if (isSystem) {
        div.classList.add('system');
        if (text.startsWith('Şu an oynatılıyor')) div.classList.add('now-playing');
        div.innerHTML = `${div.classList.contains('now-playing') ? '<i class="fas fa-play-circle"></i>' : ''}${linkify(esc(text))}${playBtnHtml && !div.classList.contains('now-playing') ? '<br>' + playBtnHtml : ''}`;
        lastMsgUser = null;
    } else {
        if (mine) div.classList.add('mine');
        if (lastMsgUser === data.user) div.classList.add('grouped');
        lastMsgUser = data.user;
        div.innerHTML = `<div class="user">${esc(data.user)}</div><div class="msg-text">${linkify(esc(text))}</div>${playBtnHtml ? '<div>' + playBtnHtml + '</div>' : ''}${meta}`;
    }
    const chip = div.querySelector('.play-chip');
    if (chip) chip.addEventListener('click', () => {
        if (myId !== currentHostId && !isFreeControl) return toast('Videoyu sadece yönetici değiştirebilir.', 'error');
        socket.emit('loadVideo', chip.dataset.vid);
    });

    const nearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 120;
    chatMessages.appendChild(div);
    if (nearBottom || mine || fromHistory) chatMessages.scrollTop = chatMessages.scrollHeight;

    if (!fromHistory && !mine && chatPanel.classList.contains('chat-closed')) {
        chatToggleBtn.classList.remove('ping'); void chatToggleBtn.offsetWidth; chatToggleBtn.classList.add('ping');
        setUnread(unreadCount + 1);
    }
}

document.getElementById('create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const pass = newRoomPassInput.value.trim();
    if (!pass) { toast("Oda için bir şifre belirle.", 'error'); return newRoomPassInput.focus(); }
    setBusy(createBtn, true, 'Kuruluyor…');
    socket.emit('createRoom', pass, (roomId) => {
        try { sessionStorage.setItem('lesa_pass_' + roomId, pass); } catch (err) {}
        window.location.href = `?oda=${roomId}`;
    });
});

document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = joinUsername.value.trim(); const password = joinPassword.value.trim();
    if (!username) { toast("Bir kullanıcı adı yaz.", 'error'); return joinUsername.focus(); }
    if (!password) { toast("Oda şifresini yaz.", 'error'); return joinPassword.focus(); }
    setBusy(joinBtn, true, 'Bağlanıyor…');
    // Kamera/mikrofon kapalı başlar; izin yalnızca ilgili düğmeye basınca istenir
    socket.emit('joinRoom', { roomId: currentRoomId, password, username }, (response) => {
        setBusy(joinBtn, false);
        if (response.success) {
            myUsername = username;
            try { localStorage.setItem('lesa_username', username); sessionStorage.setItem('lesa_pass_' + currentRoomId, password); } catch (err) {}
            myId = response.myId; currentHostId = response.hostId; isFreeControl = response.freeControl;
            updateVideoControlsUI();

            passwordScreen.classList.add('hidden'); mainScreen.classList.remove('hidden');
            renderEmptyChat();
            if (response.messages) response.messages.forEach(msg => appendMessage(msg, true));
            placeBubble(false);
            if (isDocked()) openChat();
            handleOrientationChange();
            if (player && player.loadVideoById) {
                isUserAction = false;
                if (response.isPlaying) player.loadVideoById(response.videoId, response.time);
                else player.cueVideoById(response.videoId, response.time);
                setTimeout(() => isUserAction = true, 1000);
            }
        } else { toast(response.message, 'error'); if (response.message === 'Hatalı şifre!') joinPassword.select(); }
    });
});

function updateVideoControlsUI() {
    const isHost = (myId === currentHostId);
    const roomControlBtn = document.getElementById('room-control-btn');
    if (roomControlBtn) {
        if (isHost) {
            roomControlBtn.classList.remove('hidden');
            if (isFreeControl) {
                roomControlBtn.innerHTML = '<i class="fas fa-unlock"></i> Video kontrolü: Herkes';
                roomControlBtn.className = 'room-control free';
            } else {
                roomControlBtn.innerHTML = '<i class="fas fa-lock"></i> Video kontrolü: Sadece yönetici';
                roomControlBtn.className = 'room-control locked';
            }
        } else {
            roomControlBtn.classList.add('hidden');
        }
    }

    const hasControl = (isHost || isFreeControl);
    const urlInput = document.getElementById('youtube-url');
    if (urlInput) { urlInput.disabled = !hasControl; urlInput.placeholder = hasControl ? 'YouTube linki yapıştır…' : 'Videoyu sadece yönetici değiştirebilir'; }
    const loadBtn = document.getElementById('load-btn');
    if (loadBtn) loadBtn.disabled = !hasControl;
    const playBtn = document.getElementById('custom-play-btn');
    if (playBtn) playBtn.style.display = hasControl ? 'flex' : 'none';
    const progBar = document.getElementById('progress-bar');
    if (progBar) progBar.style.pointerEvents = hasControl ? 'auto' : 'none';
    const overlay = document.getElementById('player-overlay');
    if (overlay) overlay.style.pointerEvents = hasControl ? 'auto' : 'none';
}

copyLinkBtn.addEventListener('click', async () => {
    const link = window.location.href;
    try { await navigator.clipboard.writeText(link); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    copyLinkBtn.classList.add('copied'); copyLinkBtn.innerHTML = '<i class="fas fa-check"></i><span class="hide-mobile">Kopyalandı</span>';
    toast('Davet linki kopyalandı. Şifreyi de paylaşmayı unutma!');
    setTimeout(() => { copyLinkBtn.classList.remove('copied'); copyLinkBtn.innerHTML = '<i class="fas fa-link"></i><span class="hide-mobile">Davet Linki</span>'; }, 2000);
});

sendBtn.addEventListener('click', () => {
    const msg = msgInput.value.trim();
    if (msg) { socket.emit('chatMessage', msg); msgInput.value = ''; }
    msgInput.focus();
});
msgInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); sendBtn.click(); } });
socket.on('message', msg => appendMessage(msg, false));

// YOUTUBE KONTROLLERİ
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', { height: '100%', width: '100%', videoId: '', playerVars: { 'autoplay': 0, 'controls': 0, 'disablekb': 1, 'rel': 0, 'modestbranding': 1 }, events: { 'onStateChange': onPlayerStateChange, 'onReady': onPlayerReady } });
}

let uiInterval;
function onPlayerReady(event) {
    initCustomControls();
}

function onPlayerStateChange(event) {
    const playBtnIcon = document.querySelector('#custom-play-btn i');
    if (event.data == YT.PlayerState.PLAYING) {
        if (playBtnIcon) { playBtnIcon.classList.remove('fa-play'); playBtnIcon.classList.add('fa-pause'); }
        if (isUserAction) socket.emit('playVideo', player.getCurrentTime());
    }
    else if (event.data == YT.PlayerState.PAUSED) {
        if (playBtnIcon) { playBtnIcon.classList.remove('fa-pause'); playBtnIcon.classList.add('fa-play'); }
        if (isUserAction) socket.emit('pauseVideo', player.getCurrentTime());
    }
}
document.getElementById('yt-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const url = ytUrlInput.value.trim(); const match = url.match(/(?:youtu\.be\/|\/embed\/|\/shorts\/|\/live\/|[?&]v=)([\w-]{11})/);
    const videoId = match ? match[1] : (/^[\w-]{11}$/.test(url) ? url : null);
    if (videoId) { socket.emit('loadVideo', videoId); ytUrlInput.value = ''; ytUrlInput.blur(); } else { toast("Geçerli bir YouTube linki yapıştır.", 'error'); ytUrlInput.select(); }
});
socket.on('videoChange', (videoId) => { if(player && player.loadVideoById) { isUserAction = false; player.loadVideoById(videoId); setTimeout(() => isUserAction = true, 1000); } });
socket.on('videoPlay', (time) => { if(player && player.playVideo) { isUserAction = false; if (Math.abs(player.getCurrentTime() - time) > 2) player.seekTo(time); player.playVideo(); setTimeout(() => isUserAction = true, 500); } });
socket.on('videoPause', () => { if(player && player.pauseVideo) { isUserAction = false; player.pauseVideo(); setTimeout(() => isUserAction = true, 500); } });

// -- ÖZEL KONTROL ÇUBUĞU MANTIĞI --
function formatTime(seconds) {
    const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

function initCustomControls() {
    const playBtn = document.getElementById('custom-play-btn');
    const playIcon = playBtn.querySelector('i');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    const progressBar = document.getElementById('progress-bar');
    const muteBtn = document.getElementById('custom-mute-btn');
    const muteIcon = muteBtn.querySelector('i');
    const volumeBar = document.getElementById('volume-bar');
    let isDragging = false;

    playBtn.addEventListener('click', () => {
        if (player.getPlayerState() == YT.PlayerState.PLAYING) { player.pauseVideo(); playIcon.className = 'fas fa-play'; }
        else { player.playVideo(); playIcon.className = 'fas fa-pause'; }
    });

    muteBtn.addEventListener('click', () => {
        if (player.isMuted()) { player.unMute(); muteIcon.className = 'fas fa-volume-up'; volumeBar.value = player.getVolume(); }
        else { player.mute(); muteIcon.className = 'fas fa-volume-mute'; volumeBar.value = 0; }
        updateBarColor(volumeBar);
    });

    volumeBar.addEventListener('input', (e) => {
        const val = e.target.value;
        player.setVolume(val);
        if (val == 0) { player.mute(); muteIcon.className = 'fas fa-volume-mute'; }
        else { player.unMute(); muteIcon.className = val > 50 ? 'fas fa-volume-up' : 'fas fa-volume-down'; }
        updateBarColor(e.target);
    });

    progressBar.addEventListener('mousedown', () => isDragging = true);
    progressBar.addEventListener('touchstart', () => isDragging = true);
    
    progressBar.addEventListener('input', (e) => { updateBarColor(e.target); });

    progressBar.addEventListener('change', (e) => {
        const duration = player.getDuration();
        const seekTime = (e.target.value / 100) * duration;
        player.seekTo(seekTime, true);
        isDragging = false;
    });

    function updateBarColor(el) {
        el.style.background = `linear-gradient(to right, #6b7a8a ${el.value}%, #444 ${el.value}%)`;
    }

    // Default Volume 15%
    player.unMute();
    player.setVolume(15);
    volumeBar.value = 15;
    muteIcon.className = 'fas fa-volume-down';
    updateBarColor(volumeBar);

    if(uiInterval) clearInterval(uiInterval);
    uiInterval = setInterval(() => {
        if (player && player.getCurrentTime && player.getDuration) {
            const current = player.getCurrentTime() || 0;
            const duration = player.getDuration() || 0;
            currentTimeEl.innerText = formatTime(current);
            totalTimeEl.innerText = formatTime(duration);
            if (!isDragging && duration > 0) {
                const percent = (current / duration) * 100;
                progressBar.value = percent;
                updateBarColor(progressBar);
            }
        }
    }, 500);
    
    volumeBar.value = player.getVolume(); updateBarColor(volumeBar);

    // Auto-hide controls logic
    let controlsTimeout;
    const videoSection = document.querySelector('.video-section');
    const customControls = document.getElementById('custom-video-controls');
    
    function showControls() {
        customControls.classList.add('active');
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(() => {
            customControls.classList.remove('active');
        }, 3000);
    }
    
    videoSection.addEventListener('mousemove', showControls);
    videoSection.addEventListener('click', showControls);
    videoSection.addEventListener('touchstart', showControls);
    videoSection.addEventListener('mouseleave', () => {
        clearTimeout(controlsTimeout);
        customControls.classList.remove('active');
    });
    
    // Prevent hiding while hovering over the controls themselves
    customControls.addEventListener('mouseenter', () => clearTimeout(controlsTimeout));
    customControls.addEventListener('mousemove', showControls);
    
    // Allow clicking the video to play/pause since overlay blocks iframe
    const playerOverlay = document.getElementById('player-overlay');
    if (playerOverlay) {
        playerOverlay.addEventListener('click', () => {
            if (player && player.getPlayerState) {
                if (player.getPlayerState() == YT.PlayerState.PLAYING) {
                    player.pauseVideo();
                    playIcon.className = 'fas fa-play';
                } else {
                    player.playVideo();
                    playIcon.className = 'fas fa-pause';
                }
            }
        });
    }
    
    showControls(); // show once initially
}

// --- WEBRTC ---
// Her kişiyle tek bir RTCPeerConnection kurulur. Mikrofon, kamera ve ekran ayrı izler (track) olarak
// istendiğinde eklenir/çıkarılır; bağlantı "perfect negotiation" ile kendini yeniden müzakere eder.
// Böylece medyayı odaya girdikten sonra istediğin an açıp kapatabilirsin ve karşı taraf hemen görür.
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleScreenBtn = document.getElementById('toggle-screen-btn');
const cameraBoxesContainer = document.getElementById('camera-boxes-container');
const localVideo = document.getElementById('local-video');
const localCameraBox = document.getElementById('local-camera-box');
const participantsBtn = document.getElementById('participants-btn');
const participantsDropdown = document.getElementById('participants-dropdown');
const participantsList = document.getElementById('participants-list');
const userCountSpan = document.getElementById('user-count');
const mainScreenshare = document.getElementById('main-screenshare');
const screenshareLabel = document.getElementById('screenshare-label');

// Mobil tarayıcılar ekran paylaşımını desteklemiyor; düğmeyi hiç gösterme
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) toggleScreenBtn.classList.add('hidden');

let isMicOn = false; let isCamOn = false; let isScreenSharing = false;
let currentUsers = {};
const peers = {}; const locallyMutedUsers = new Set(); const userVolumes = {};
const remoteMedia = {}; // userId -> { streams: { streamId: MediaStream } }
const configuration = { iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:global.stun.twilio.com:3478' }
] };

// Yerel medya: mikrofon + kamera tek akışta (camStream), ekran ayrı akışta (screenStream)
const camStream = new MediaStream();
let screenStream = null;
const local = { mic: null, cam: null, screenVideo: null, screenAudio: null };
const pending = { mic: false, cam: false, screen: false };

function localTracks() {
    const out = [];
    if (local.mic) out.push([local.mic, camStream]);
    if (local.cam) out.push([local.cam, camStream]);
    if (local.screenVideo) out.push([local.screenVideo, screenStream]);
    if (local.screenAudio) out.push([local.screenAudio, screenStream]);
    return out;
}

function mediaErrorMessage(err, what) {
    switch (err && err.name) {
        case 'NotAllowedError': case 'PermissionDeniedError':
            return `${what} izni verilmedi. Adres çubuğundaki simgeden izin verip tekrar dene.`;
        case 'NotReadableError': case 'TrackStartError':
            return `${what} başlatılamadı; başka bir uygulama (Zoom, Teams, Discord, Kamera uygulaması vb.) kullanıyor olabilir. Onu kapatıp tekrar dene.`;
        case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError':
            return `Bu cihazda ${what.toLowerCase()} bulunamadı.`;
        default:
            return `${what} açılamadı${err && err.message ? ': ' + err.message : '.'}`;
    }
}

// Bazı (özellikle Windows) kamera sürücüleri belirli çözünürlükte açılamayınca "cihaz kullanılıyor"
// (NotReadableError) hatası verir. Önce tercih edilen ayarlarla dene, olmazsa kısa bir bekleme
// sonrası hiçbir kısıt olmadan tekrar dene.
async function openDevice(kind, preferred) {
    try {
        return await navigator.mediaDevices.getUserMedia({ [kind]: preferred });
    } catch (err) {
        if (!['NotReadableError', 'TrackStartError', 'OverconstrainedError', 'AbortError'].includes(err && err.name)) throw err;
        console.warn(`${kind} tercih edilen ayarlarla açılamadı, varsayılanla deneniyor:`, err);
        await new Promise(r => setTimeout(r, 400));
        return await navigator.mediaDevices.getUserMedia({ [kind]: true });
    }
}

// ---- Bağlantılar ----
function getPeer(userId) {
    if (peers[userId]) return peers[userId];
    const pc = new RTCPeerConnection(configuration);
    const peer = { pc, makingOffer: false, ignoreOffer: false, polite: socket.id < userId };
    peers[userId] = peer;

    pc.onnegotiationneeded = async () => {
        try {
            peer.makingOffer = true;
            await pc.setLocalDescription();
            socket.emit('signal', userId, { sdp: pc.localDescription });
        } catch (err) { console.error('Teklif oluşturulamadı:', err); }
        finally { peer.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('signal', userId, { ice: candidate }); };
    pc.ontrack = ({ track, streams }) => {
        const stream = streams[0] || new MediaStream([track]);
        const rm = remoteMedia[userId] = remoteMedia[userId] || { streams: {} };
        rm.streams[stream.id] = stream;
        stream.onremovetrack = () => renderRemote(userId);
        track.onunmute = () => renderRemote(userId);
        renderRemote(userId);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && pc.restartIce) pc.restartIce(); };

    localTracks().forEach(([track, stream]) => pc.addTrack(track, stream));
    return peer;
}

function ensurePeers() {
    Object.keys(currentUsers).forEach(id => { if (id !== socket.id) getPeer(id); });
}
function addTrackToAll(track, stream) {
    ensurePeers();
    Object.values(peers).forEach(({ pc }) => {
        if (!pc.getSenders().some(s => s.track === track)) pc.addTrack(track, stream);
    });
}
function removeTrackFromAll(track) {
    if (!track) return;
    Object.values(peers).forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track === track);
        if (sender) pc.removeTrack(sender);
    });
}

socket.on('signal', async (from, msg) => {
    const peer = getPeer(from); const pc = peer.pc;
    try {
        if (msg.sdp) {
            const collision = msg.sdp.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
            peer.ignoreOffer = !peer.polite && collision;
            if (peer.ignoreOffer) return;
            await pc.setRemoteDescription(msg.sdp);
            if (msg.sdp.type === 'offer') {
                await pc.setLocalDescription();
                socket.emit('signal', from, { sdp: pc.localDescription });
            }
        } else if (msg.ice) {
            try { await pc.addIceCandidate(msg.ice); }
            catch (err) { if (!peer.ignoreOffer) console.error('ICE adayı eklenemedi:', err); }
        }
    } catch (err) { console.error('Sinyal hatası:', err); }
});

// ---- Durum bildirimi & arayüz ----
function emitMediaState() {
    socket.emit('mediaState', {
        isMicOn, isCamOn, isScreenSharing,
        camStreamId: camStream.id, screenStreamId: screenStream ? screenStream.id : null
    });
}
function setBtn(btn, on, onIcon, offIcon, offClass, label) {
    btn.className = 'control-btn' + (on ? '' : ' ' + offClass);
    btn.innerHTML = `<i class="fas ${on ? onIcon : offIcon}"></i>`;
    btn.title = `${label}: ${on ? 'açık' : 'kapalı'}`;
}
function refreshLocalUI() {
    setBtn(toggleMicBtn, isMicOn, 'fa-microphone', 'fa-microphone-slash', 'muted', 'Mikrofon');
    setBtn(toggleCamBtn, isCamOn, 'fa-video', 'fa-video-slash', 'camera-off', 'Kamera');
    toggleScreenBtn.className = 'control-btn' + (isScreenSharing ? ' muted' : '');
    toggleScreenBtn.innerHTML = `<i class="fas ${isScreenSharing ? 'fa-stop' : 'fa-desktop'}"></i>`;
    toggleScreenBtn.title = isScreenSharing ? 'Paylaşımı durdur' : 'Ekran paylaş';
    [toggleMicBtn, toggleCamBtn, toggleScreenBtn].forEach(b => b.classList.toggle('pending', pending[b === toggleMicBtn ? 'mic' : b === toggleCamBtn ? 'cam' : 'screen']));

    if (isCamOn && local.cam) {
        if (!localVideo.srcObject || localVideo.srcObject.getVideoTracks()[0] !== local.cam) localVideo.srcObject = new MediaStream([local.cam]);
        localCameraBox.classList.remove('hidden');
    } else { localCameraBox.classList.add('hidden'); localVideo.srcObject = null; }
    cameraBoxesContainer.classList.remove('hidden');
    manageScreenshareView();
}

function createRemoteBox(userId) {
    const box = document.createElement('div');
    box.className = 'camera-box hidden'; box.id = `camera-${userId}`;
    const n = cameraBoxesContainer.querySelectorAll('.camera-box').length;
    box.style.left = `${12 + (n % 4) * 196}px`; box.style.top = `${12 + Math.floor(n / 4) * 128}px`;
    const vid = document.createElement('video'); vid.className = 'remote-video'; vid.autoplay = true; vid.playsInline = true;
    const ph = document.createElement('div'); ph.className = 'camera-placeholder'; ph.textContent = 'Kamera kapalı';
    const label = document.createElement('span'); label.className = 'camera-label';
    box.append(vid, ph, label); cameraBoxesContainer.appendChild(box);
    return box;
}

function renderRemote(userId) {
    const rm = remoteMedia[userId]; const user = currentUsers[userId];
    if (!rm || !user) return;
    const screenS = user.screenStreamId ? rm.streams[user.screenStreamId] : null;
    const camS = (user.camStreamId && rm.streams[user.camStreamId]) || Object.values(rm.streams).find(s => s !== screenS && s.id !== user.screenStreamId);
    if (camS) {
        const box = document.getElementById(`camera-${userId}`) || createRemoteBox(userId);
        const vid = box.querySelector('video');
        if (vid.srcObject !== camS) vid.srcObject = camS;
        vid.muted = locallyMutedUsers.has(userId);
        vid.volume = userVolumes[userId] != null ? userVolumes[userId] : 1;
        vid.play().catch(() => {});
        box.querySelector('.camera-label').textContent = user.username + (user.isMicOn ? '' : ' 🔇');
        // Kamera kapalıyken kutu gizlenir ama sesi çalmaya devam eder
        box.classList.toggle('hidden', !(user.isCamOn && camS.getVideoTracks().length));
    }
    manageScreenshareView();
}

function manageScreenshareView() {
    const playerDiv = document.getElementById('player');
    let share = null;
    if (isScreenSharing && screenStream) share = { id: socket.id, stream: screenStream, name: 'Sen' };
    else {
        for (const id in currentUsers) {
            const u = currentUsers[id]; const rm = remoteMedia[id];
            if (u.isScreenSharing && u.screenStreamId && rm && rm.streams[u.screenStreamId]) { share = { id, stream: rm.streams[u.screenStreamId], name: u.username }; break; }
        }
    }
    if (share) {
        if (mainScreenshare.srcObject !== share.stream) mainScreenshare.srcObject = share.stream;
        mainScreenshare.muted = share.id === socket.id; // kendi ekran sesini yankı yapmasın diye duyma
        mainScreenshare.play().catch(() => {});
        mainScreenshare.classList.remove('hidden');
        screenshareLabel.innerHTML = `<i class="fas fa-desktop"></i> ${esc(share.name)} ekran paylaşıyor`;
        screenshareLabel.classList.remove('hidden');
        playerDiv.style.visibility = 'hidden';
    } else {
        mainScreenshare.srcObject = null;
        mainScreenshare.classList.add('hidden');
        screenshareLabel.classList.add('hidden');
        playerDiv.style.visibility = 'visible';
    }
}

// ---- Mikrofon ----
async function setMic(on) {
    if (pending.mic) return;
    if (on && !local.mic) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Tarayıcın mikrofonu desteklemiyor.', 'error');
        pending.mic = true; refreshLocalUI();
        try {
            const s = await openDevice('audio', { echoCancellation: true, noiseSuppression: true, autoGainControl: true });
            local.mic = s.getAudioTracks()[0];
            camStream.addTrack(local.mic);
            local.mic.onended = () => { removeTrackFromAll(local.mic); camStream.removeTrack(local.mic); local.mic = null; isMicOn = false; emitMediaState(); refreshLocalUI(); };
            isMicOn = true; emitMediaState(); addTrackToAll(local.mic, camStream);
        } catch (err) { console.error(err); toast(mediaErrorMessage(err, 'Mikrofon'), 'error'); }
        finally { pending.mic = false; refreshLocalUI(); }
        return;
    }
    // Açık/kapalı geçişi izi kaldırmadan yapılır: anında olur, yeniden bağlantı gerekmez
    if (local.mic) local.mic.enabled = on;
    isMicOn = on && !!local.mic; emitMediaState(); refreshLocalUI();
}
toggleMicBtn.addEventListener('click', () => setMic(!isMicOn));

// ---- Kamera ----
async function setCam(on) {
    if (pending.cam) return;
    if (on) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('Tarayıcın kamerayı desteklemiyor.', 'error');
        pending.cam = true; refreshLocalUI();
        try {
            const s = await openDevice('video', { width: { ideal: 640 }, height: { ideal: 360 } });
            local.cam = s.getVideoTracks()[0];
            camStream.addTrack(local.cam);
            local.cam.onended = () => setCam(false);
            isCamOn = true; emitMediaState(); addTrackToAll(local.cam, camStream);
        } catch (err) { console.error(err); toast(mediaErrorMessage(err, 'Kamera'), 'error'); }
        finally { pending.cam = false; refreshLocalUI(); }
        return;
    }
    // Kapatırken izi tamamen durdur: kamera ışığı da söner
    if (local.cam) { removeTrackFromAll(local.cam); camStream.removeTrack(local.cam); local.cam.onended = null; local.cam.stop(); local.cam = null; }
    isCamOn = false; emitMediaState(); refreshLocalUI();
}
toggleCamBtn.addEventListener('click', () => setCam(!isCamOn));

// ---- Ekran paylaşımı (ses dahil) ----
async function startScreenShare() {
    if (pending.screen || isScreenSharing) return;
    pending.screen = true; refreshLocalUI();
    try {
        const s = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            systemAudio: 'include', selfBrowserSurface: 'exclude'
        });
        screenStream = s;
        local.screenVideo = s.getVideoTracks()[0];
        local.screenAudio = s.getAudioTracks()[0] || null;
        if ('contentHint' in local.screenVideo) local.screenVideo.contentHint = 'motion';
        local.screenVideo.onended = stopScreenSharing;
        isScreenSharing = true; emitMediaState();
        s.getTracks().forEach(t => addTrackToAll(t, s));
        if (!local.screenAudio) toast('Ekran sesi paylaşılmıyor. Sesli paylaşmak için pencerede "Sekme sesini/Sistem sesini paylaş" seçeneğini işaretle.');
    } catch (err) {
        if (err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') toast(mediaErrorMessage(err, 'Ekran paylaşımı'), 'error');
        screenStream = null;
    } finally { pending.screen = false; refreshLocalUI(); }
}
function stopScreenSharing() {
    if (!isScreenSharing) return;
    [local.screenVideo, local.screenAudio].forEach(t => { if (t) { removeTrackFromAll(t); t.onended = null; t.stop(); } });
    local.screenVideo = null; local.screenAudio = null; screenStream = null;
    isScreenSharing = false; emitMediaState(); refreshLocalUI();
}
toggleScreenBtn.addEventListener('click', () => { if (isScreenSharing) stopScreenSharing(); else startScreenShare(); });

participantsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    participantsDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!participantsDropdown.classList.contains('hidden')) {
        if (!participantsDropdown.contains(e.target) && !participantsBtn.contains(e.target)) {
            participantsDropdown.classList.add('hidden');
        }
    }
});

socket.on('update-users', (usersMap) => {
    currentUsers = usersMap;
    participantsList.innerHTML = ''; const userKeys = Object.keys(usersMap); userCountSpan.innerText = userKeys.length;
    userKeys.forEach(userId => {
        const user = usersMap[userId]; const isMe = userId === socket.id;
        const li = document.createElement('li'); li.className = 'participant-item';
        let actionsHtml = '';
        if (!isMe) {
            const isMuted = locallyMutedUsers.has(userId);
            const vol = Math.round((userVolumes[userId] != null ? userVolumes[userId] : 1) * 100);
            actionsHtml = `
                <div class="participant-controls">
                    <input type="range" class="remote-vol-slider" data-id="${esc(userId)}" min="0" max="100" value="${isMuted ? 0 : vol}" title="Kişisel ses">
                    <button class="host-action-btn ${isMuted ? 'muted' : ''} mute-remote-btn" data-id="${esc(userId)}" title="Sesi aç/kapat"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button>`;

            // Yönetici eylemleri
            if (myId === currentHostId) {
                actionsHtml += `
                    <button class="host-action-btn force-off" data-action="forceMute" data-id="${esc(userId)}" title="Mikrofonunu kapat"><i class="fas fa-microphone-slash"></i></button>
                    <button class="host-action-btn force-off" data-action="forceCamOff" data-id="${esc(userId)}" title="Kamerasını kapat"><i class="fas fa-video-slash"></i></button>
                `;
            }
            actionsHtml += `</div>`;
        }
        const media = `<span class="p-media"><i class="fas ${user.isMicOn ? 'fa-microphone on' : 'fa-microphone-slash'}"></i><i class="fas ${user.isCamOn ? 'fa-video on' : 'fa-video-slash'}"></i>${user.isScreenSharing ? '<i class="fas fa-desktop on"></i>' : ''}</span>`;
        li.innerHTML = `<div class="participant-header"><span class="p-avatar">${esc([...String(user.username)][0] || '?')}</span><span class="p-name">${esc(user.username)}${isMe ? '<small>(sen)</small>' : ''}</span>${user.isHost ? '<i class="fas fa-crown p-host" title="Yönetici"></i>' : ''}${media}</div>${actionsHtml}`;
        participantsList.appendChild(li);
        if (!isMe) renderRemote(userId);
    });
    ensurePeers();

    // Kişisel ses ayarı
    participantsList.querySelectorAll('.remote-vol-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const targetId = e.target.getAttribute('data-id');
            userVolumes[targetId] = e.target.value / 100;
            const videoElem = document.querySelector(`#camera-${CSS.escape(targetId)} video`);
            if (videoElem) { videoElem.volume = userVolumes[targetId]; videoElem.muted = userVolumes[targetId] === 0 || locallyMutedUsers.has(targetId); }
        });
    });

    // Kişiyi sessize alma (sadece senin için)
    participantsList.querySelectorAll('.mute-remote-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.mute-remote-btn');
            const targetId = targetBtn.getAttribute('data-id');
            const videoElem = document.querySelector(`#camera-${CSS.escape(targetId)} video`);
            const slider = participantsList.querySelector(`.remote-vol-slider[data-id="${CSS.escape(targetId)}"]`);
            if (locallyMutedUsers.has(targetId)) {
                locallyMutedUsers.delete(targetId); targetBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
                targetBtn.classList.remove('muted');
                if (videoElem) videoElem.muted = false;
                if (slider) slider.value = Math.round((userVolumes[targetId] || 1) * 100);
            } else {
                locallyMutedUsers.add(targetId); targetBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
                targetBtn.classList.add('muted');
                if (videoElem) videoElem.muted = true;
                if (slider) slider.value = 0;
            }
        });
    });

    participantsList.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => socket.emit(btn.dataset.action, btn.dataset.id));
    });

    manageScreenshareView();
});

// Yeni gelen kişiye mevcut medyamızı hemen gönder
socket.on('user-joined', (userId) => { getPeer(userId); });

socket.on('user-left', (userId) => {
    if (peers[userId]) { peers[userId].pc.close(); delete peers[userId]; }
    const box = document.getElementById(`camera-${userId}`); if (box) box.remove();
    delete remoteMedia[userId];
    locallyMutedUsers.delete(userId);
    manageScreenshareView();
});

// --- TAM EKRAN MANTIĞI ---
if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(err => console.log(err)); } 
        else { document.exitFullscreen(); }
    });
    document.addEventListener('fullscreenchange', () => {
        if (document.fullscreenElement) fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
        else fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
    });
}

// --- HEADER GİZLEME VE MOBİL YATAY MANTIĞI ---
const headerToggleBtn = document.getElementById('header-toggle-btn');
const mainHeader = document.getElementById('main-header');

// Header gizliyken üstte görünen sekme header'ı geri açar; header içindeki ok onu gizler.
headerToggleBtn.addEventListener('click', () => {
    mainHeader.classList.toggle('collapsed');
    if (mainHeader.classList.contains('collapsed') && window.innerWidth <= 768) closeChat();
});
document.getElementById('header-hide-btn').addEventListener('click', () => headerToggleBtn.click());

function handleOrientationChange() {
    const isLandscape = window.innerWidth > window.innerHeight;
    const isMobile = Math.min(window.innerWidth, window.innerHeight) <= 500;
    if (isLandscape && isMobile) {
        mainHeader.classList.add('collapsed');
        closeChat();
    } else if (!isLandscape && isMobile) {
        mainHeader.classList.remove('collapsed');
    }
}
window.addEventListener('resize', handleOrientationChange);
window.addEventListener('orientationchange', handleOrientationChange);
handleOrientationChange();

// --- SÜRÜKLE BIRAK MANTIĞI ---
let isDragging = false; let currentBox = null; let offsetX = 0, offsetY = 0;
function getEventPos(e) { return e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }; }

function startDrag(e) {
    const box = e.target.closest('.camera-box'); if (!box) return;
    const rect = box.getBoundingClientRect(); const pos = getEventPos(e);
    if (pos.x >= rect.right - 20 && pos.y >= rect.bottom - 20) return; 

    e.preventDefault(); isDragging = true; currentBox = box;
    const parentRect = cameraBoxesContainer.getBoundingClientRect();
    offsetX = pos.x - parentRect.left - parseInt(box.style.left || 0); offsetY = pos.y - parentRect.top - parseInt(box.style.top || 0);
    box.style.cursor = 'grabbing'; document.querySelector('.player-wrapper').style.pointerEvents = 'none'; 
}

function drag(e) {
    if (!isDragging || !currentBox) return;
    const pos = getEventPos(e); const parentRect = cameraBoxesContainer.getBoundingClientRect();
    currentBox.style.left = `${pos.x - parentRect.left - offsetX}px`; currentBox.style.top = `${pos.y - parentRect.top - offsetY}px`;
}

function stopDrag() {
    if (isDragging && currentBox) {
        currentBox.style.cursor = 'grab'; document.querySelector('.player-wrapper').style.pointerEvents = 'auto';
        isDragging = false; currentBox = null;
    }
}

document.addEventListener('mousedown', startDrag); document.addEventListener('mousemove', drag); document.addEventListener('mouseup', stopDrag);
document.addEventListener('touchstart', startDrag, {passive: false}); document.addEventListener('touchmove', drag, {passive: false}); document.addEventListener('touchend', stopDrag);

// --- SÜRÜKLENEBİLİR SOHBET BALONU ---
// Balon ekranın her yerine sürüklenir, bırakınca en yakın kenara yapışır ve konumu hatırlanır.
// Sohbet paneli her zaman balonun yanında, ekrana sığacak şekilde açılır.
const BUBBLE = 56, EDGE = 12, GAP = 10;
const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));
let bubbleState = { side: 'right', yr: null }; // yr: dikey konum (0 = üst, 1 = alt)
try { const saved = JSON.parse(localStorage.getItem('lesa_bubble')); if (saved && (saved.side === 'left' || saved.side === 'right')) bubbleState = saved; } catch (e) {}

function isDocked() { return document.body.classList.contains('chat-docked') && window.innerWidth > 900; }

function bubbleXY() {
    const maxY = window.innerHeight - BUBBLE - EDGE;
    const y = bubbleState.yr == null ? window.innerHeight - BUBBLE - 84 : bubbleState.yr * (window.innerHeight - BUBBLE);
    return { x: bubbleState.side === 'left' ? EDGE : window.innerWidth - BUBBLE - EDGE, y: clamp(y, EDGE, maxY) };
}

function placeBubble(animate) {
    const p = bubbleXY();
    chatToggleBtn.classList.toggle('snapping', !!animate);
    Object.assign(chatToggleBtn.style, { left: p.x + 'px', top: p.y + 'px', right: 'auto', bottom: 'auto' });
    placeChatPanel();
}

function placeChatPanel() {
    if (isDocked()) { ['left', 'top', 'right', 'bottom', 'height'].forEach(k => chatPanel.style.removeProperty(k)); return; }
    const bx = parseFloat(chatToggleBtn.style.left), by = parseFloat(chatToggleBtn.style.top);
    if (isNaN(bx)) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = Math.min(360, vw - 2 * EDGE);
    const preferredH = Math.min(520, vh * 0.62);
    const spaceAbove = by - GAP - EDGE, spaceBelow = vh - (by + BUBBLE) - GAP - EDGE;
    const above = spaceAbove >= spaceBelow;
    const h = Math.max(240, Math.min(preferredH, above ? spaceAbove : spaceBelow));
    const onLeft = bx + BUBBLE / 2 < vw / 2;
    const left = clamp(onLeft ? bx : bx + BUBBLE - w, EDGE, vw - w - EDGE);
    const top = clamp(above ? by - GAP - h : by + BUBBLE + GAP, EDGE, vh - h - EDGE);
    Object.assign(chatPanel.style, { width: w + 'px', height: h + 'px', left: left + 'px', top: top + 'px', right: 'auto', bottom: 'auto' });
    chatPanel.style.setProperty('--origin', `${above ? 'bottom' : 'top'} ${onLeft ? 'left' : 'right'}`);
}

let chatDrag = null;
chatToggleBtn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    chatDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: parseFloat(chatToggleBtn.style.left), oy: parseFloat(chatToggleBtn.style.top), moved: false };
    chatToggleBtn.setPointerCapture(e.pointerId);
});
chatToggleBtn.addEventListener('pointermove', (e) => {
    if (!chatDrag || e.pointerId !== chatDrag.id) return;
    const dx = e.clientX - chatDrag.sx, dy = e.clientY - chatDrag.sy;
    if (!chatDrag.moved && Math.hypot(dx, dy) < 6) return; // küçük titremeler tıklama sayılır
    chatDrag.moved = true;
    chatToggleBtn.classList.add('dragging'); chatToggleBtn.classList.remove('snapping');
    const x = clamp(chatDrag.ox + dx, EDGE, window.innerWidth - BUBBLE - EDGE);
    const y = clamp(chatDrag.oy + dy, EDGE, window.innerHeight - BUBBLE - EDGE);
    chatToggleBtn.style.left = x + 'px'; chatToggleBtn.style.top = y + 'px';
    placeChatPanel(); // açıksa panel balonu canlı takip eder
});
function endChatDrag(e) {
    if (!chatDrag || e.pointerId !== chatDrag.id) return;
    const moved = chatDrag.moved; chatDrag = null;
    chatToggleBtn.classList.remove('dragging');
    if (!moved) return;
    const x = parseFloat(chatToggleBtn.style.left), y = parseFloat(chatToggleBtn.style.top);
    bubbleState = { side: x + BUBBLE / 2 < window.innerWidth / 2 ? 'left' : 'right', yr: y / (window.innerHeight - BUBBLE) };
    try { localStorage.setItem('lesa_bubble', JSON.stringify(bubbleState)); } catch (err) {}
    placeBubble(true);
    dragHasMovedChat = true; setTimeout(() => { dragHasMovedChat = false; }, 0); // sürükleme sonrası tıklamayı yut
}
chatToggleBtn.addEventListener('pointerup', endChatDrag);
chatToggleBtn.addEventListener('pointercancel', endChatDrag);
// Çift tıklama: balonu varsayılan yerine (sağ alt) döndür
chatToggleBtn.addEventListener('dblclick', () => {
    bubbleState = { side: 'right', yr: null };
    try { localStorage.removeItem('lesa_bubble'); } catch (err) {}
    placeBubble(true);
});
window.addEventListener('resize', () => placeBubble(false));

// Masaüstünde sohbeti sağa sabitleme (isteğe bağlı, hatırlanır)
const chatDockBtn = document.getElementById('chat-dock-btn');
function setDocked(on) {
    document.body.classList.toggle('chat-docked', on);
    try { localStorage.setItem('lesa_chat_docked', on ? '1' : '0'); } catch (e) {}
    chatDockBtn.innerHTML = `<i class="fas ${on ? 'fa-up-right-from-square' : 'fa-table-columns'}"></i>`;
    chatDockBtn.title = on ? 'Yüzen pencere yap' : 'Sağa sabitle';
    placeBubble(false);
}
chatDockBtn.addEventListener('click', () => setDocked(!document.body.classList.contains('chat-docked')));
try { setDocked(localStorage.getItem('lesa_chat_docked') === '1'); } catch (e) { setDocked(false); }

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !chatPanel.classList.contains('chat-closed') && !isDocked()) closeChat();
});


// --- REACTIONS ---
const emojiToggleBtn = document.getElementById('emoji-toggle-btn');
const emojiPickerMenu = document.getElementById('emoji-picker-menu');
if (emojiToggleBtn) {
    emojiToggleBtn.addEventListener('click', () => {
        emojiPickerMenu.classList.toggle('hidden');
        emojiToggleBtn.classList.toggle('active', !emojiPickerMenu.classList.contains('hidden'));
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#emoji-picker-menu, #emoji-toggle-btn')) { emojiPickerMenu.classList.add('hidden'); emojiToggleBtn.classList.remove('active'); }
    });
}

function sendReaction(emoji) {
    socket.emit('reaction', emoji);
    if(emojiPickerMenu) {
        emojiPickerMenu.classList.add('hidden');
        emojiToggleBtn.classList.remove('active');
    }
}
socket.on('reaction', (data) => {
    const chatSection = document.querySelector('.chat-section');
    if (!chatSection) return;
    const el = document.createElement('div');
    el.className = 'flying-emoji';
    el.textContent = data.emoji;
    const who = document.createElement('small'); who.textContent = data.username || ''; el.appendChild(who);
    el.style.left = Math.random() * 60 + 20 + '%';
    el.style.bottom = '10px';
    chatSection.appendChild(el);
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 3000);
});


// HOST ACTIONS & EVENTS
const roomControlBtn = document.getElementById('room-control-btn');
if (roomControlBtn) {
    roomControlBtn.addEventListener('click', () => {
        socket.emit('toggleFreeControl');
    });
}

socket.on("roomControlChanged", (free) => {
    isFreeControl = free;
    updateVideoControlsUI();
});

socket.on("hostChanged", (newHostId) => {
    currentHostId = newHostId;
    myId = socket.id;
    updateVideoControlsUI();
});

socket.on("forceMute", () => {
    if (isMicOn) { setMic(false); toast('Yönetici mikrofonunu kapattı.'); }
});

socket.on("forceCamOff", () => {
    if (isCamOn) { setCam(false); toast('Yönetici kameranı kapattı.'); }
});

