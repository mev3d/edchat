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
function openChat() { chatPanel.classList.remove('chat-closed'); chatHeaderBtn.classList.add('active'); setUnread(0); chatMessages.scrollTop = chatMessages.scrollHeight; }
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
        chatToggleBtn.style.transform = 'scale(1.2)';
        setTimeout(() => chatToggleBtn.style.transform = 'scale(1)', 200);
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
    // Bağlantılar kurulmadan önce medya hazır olmalı (kamera/mikrofon kapalı başlar)
    // İzin penceresi cevapsız kalırsa girişi sonsuza kadar bekletme
    await Promise.race([getMediaStream(true), new Promise(r => setTimeout(r, 10000))]);
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
            if (window.innerWidth > 900) openChat();
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

// Mobil tarayıcılar ekran paylaşımını desteklemiyor; düğmeyi hiç gösterme
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) toggleScreenBtn.classList.add('hidden');

let localStream = null; let screenStream = null;
let isMicOn = false; let isCamOn = false; let isScreenSharing = false;
let currentUsers = {}; 
const peers = {}; const locallyMutedUsers = new Set(); 
const configuration = { 'iceServers': [{'urls': 'stun:stun.l.google.com:19302'}] };

let mediaRequested = false;

async function getMediaStream(silent) {
    if (mediaRequested) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (!silent) toast('Tarayıcın kamera/mikrofonu desteklemiyor.', 'error'); return false; }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStream.getAudioTracks()[0].enabled = false; localStream.getVideoTracks()[0].enabled = false;
        localVideo.srcObject = localStream; cameraBoxesContainer.classList.remove('hidden');
        mediaRequested = true;
        
        // Update peer connections with new tracks
        for (let userId in peers) {
            localStream.getTracks().forEach(track => {
                const sender = peers[userId].getSenders().find(s => s.track && s.track.kind === track.kind);
                if (!sender) peers[userId].addTrack(track, localStream);
            });
        }
        return true;
    } catch (err) { 
        console.error("Medya cihazlarına erişilemedi:", err); 
        toast(silent ? "Kamera/mikrofon izni yok; sadece izleyip yazabilirsin." : "Kamera veya mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.", 'error');
        return false; 
    }
}

function emitMediaState() {
    socket.emit('mediaState', { isMicOn, isCamOn: isCamOn || isScreenSharing, isScreenSharing });
    if (!isCamOn && !isScreenSharing) localCameraBox.classList.add('hidden'); 
    else localCameraBox.classList.remove('hidden');
}

function manageScreenshareView() {
    const mainScreenshare = document.getElementById('main-screenshare');
    const playerDiv = document.getElementById('player');
    
    let sharingUser = null;
    if (isScreenSharing && screenStream) {
        sharingUser = { id: socket.id, stream: screenStream };
    } else {
        for (let userId in currentUsers) {
            if (currentUsers[userId].isScreenSharing) {
                const box = document.getElementById(`camera-${userId}`);
                if (box) {
                    const vid = box.querySelector('video');
                    if (vid && vid.srcObject) {
                        sharingUser = { id: userId, stream: vid.srcObject };
                        box.classList.add('hidden');
                    }
                }
            }
        }
    }

    if (sharingUser) {
        if (mainScreenshare.srcObject !== sharingUser.stream) mainScreenshare.srcObject = sharingUser.stream;
        mainScreenshare.muted = (sharingUser.id === socket.id);
        mainScreenshare.classList.remove('hidden');
        playerDiv.style.visibility = 'hidden'; 
    } else {
        mainScreenshare.srcObject = null;
        mainScreenshare.classList.add('hidden');
        playerDiv.style.visibility = 'visible'; 
    }
}

toggleMicBtn.addEventListener('click', async () => {
    const success = await getMediaStream();
    if (!success) return;
    isMicOn = !isMicOn;
    if (localStream) localStream.getAudioTracks()[0].enabled = isMicOn;
    if (isMicOn) {
        toggleMicBtn.className = 'control-btn'; toggleMicBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    } else {
        toggleMicBtn.className = 'control-btn muted'; toggleMicBtn.innerHTML = '<i class="fas fa-microphone-slash"></i>';
    }
    emitMediaState();
});

toggleCamBtn.addEventListener('click', async () => {
    if (isScreenSharing) return toast("Ekran paylaşımı açıkken kamera açılamaz.", 'error');
    const success = await getMediaStream();
    if (!success) return;
    isCamOn = !isCamOn;
    if (localStream) localStream.getVideoTracks()[0].enabled = isCamOn;
    if (isCamOn) {
        toggleCamBtn.className = 'control-btn'; toggleCamBtn.innerHTML = '<i class="fas fa-video"></i>';
    } else {
        toggleCamBtn.className = 'control-btn camera-off'; toggleCamBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
    }
    localVideo.srcObject = localStream; localVideo.style.display = isCamOn ? 'block' : 'none'; 
    emitMediaState();
});

toggleScreenBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            isScreenSharing = true;
            if (isCamOn) {
                isCamOn = false; localStream.getVideoTracks()[0].enabled = false;
                toggleCamBtn.className = 'control-btn camera-off'; toggleCamBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
            }
            toggleScreenBtn.classList.add('muted'); toggleScreenBtn.innerHTML = '<i class="fas fa-times-circle"></i>'; 
            localVideo.srcObject = screenStream; localVideo.style.display = 'block';

            const screenVideoTrack = screenStream.getVideoTracks()[0];
            const screenAudioTrack = screenStream.getAudioTracks()[0];
            for (let userId in peers) {
                const videoSender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'video');
                if (videoSender) videoSender.replaceTrack(screenVideoTrack);
                
                if (screenAudioTrack) {
                    const audioSender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) audioSender.replaceTrack(screenAudioTrack);
                }
            }
            emitMediaState();
            manageScreenshareView();
            screenVideoTrack.onended = () => { stopScreenSharing(); };
        } catch (err) { console.error("Ekran paylaşılamadı:", err); }
    } else { stopScreenSharing(); }
});

function stopScreenSharing() {
    if (!isScreenSharing) return;
    isScreenSharing = false;
    if (screenStream) { screenStream.getTracks().forEach(track => track.stop()); screenStream = null; }
    toggleScreenBtn.classList.remove('muted'); toggleScreenBtn.innerHTML = '<i class="fas fa-desktop"></i>';
    localVideo.srcObject = localStream; localVideo.style.display = 'none';

    const camVideoTrack = localStream.getVideoTracks()[0];
    const camAudioTrack = localStream.getAudioTracks()[0];
    for (let userId in peers) {
        const videoSender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'video');
        if (videoSender) videoSender.replaceTrack(camVideoTrack);

        const audioSender = peers[userId].getSenders().find(s => s.track && s.track.kind === 'audio');
        if (audioSender) audioSender.replaceTrack(camAudioTrack);
    }
    emitMediaState();
    manageScreenshareView();
}

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
            actionsHtml = `
                <div class="participant-controls">
                    <input type="range" class="remote-vol-slider" data-id="${userId}" min="0" max="100" value="${isMuted ? 0 : 100}" title="Kişisel Ses">
                    <button class="host-action-btn ${isMuted ? 'muted' : ''} mute-remote-btn" data-id="${userId}" title="Sesi Aç/Kapat"><i class="fas ${isMuted ? 'fa-volume-mute' : 'fa-volume-up'}"></i></button>`;
            
            // Host actions
            if (myId === currentHostId) {
                actionsHtml += `
                    <button class="host-action-btn force-off" onclick="socket.emit('forceMute', '${userId}')" title="Kişinin Mikrofonunu Kapat"><i class="fas fa-microphone-slash"></i></button>
                    <button class="host-action-btn force-off" onclick="socket.emit('forceCamOff', '${userId}')" title="Kişinin Kamerasını Kapat"><i class="fas fa-video-slash"></i></button>
                `;
            }
            actionsHtml += `</div>`;
        }
        const media = `<span class="p-media"><i class="fas ${user.isMicOn ? 'fa-microphone on' : 'fa-microphone-slash'}"></i><i class="fas ${user.isScreenSharing ? 'fa-desktop on' : (user.isCamOn ? 'fa-video on' : 'fa-video-slash')}"></i></span>`;
        li.innerHTML = `<div class="participant-header"><span class="p-avatar">${esc([...String(user.username)][0] || '?')}</span><span class="p-name">${esc(user.username)}${isMe ? '<small>(sen)</small>' : ''}</span>${user.isHost ? '<i class="fas fa-crown p-host" title="Yönetici"></i>' : ''}${media}</div>${actionsHtml}`;
        participantsList.appendChild(li);

        if (!isMe) {
            const remoteBox = document.getElementById(`camera-${userId}`);
            if (remoteBox) { 
                if (!user.isCamOn) remoteBox.classList.add('hidden'); 
                else remoteBox.classList.remove('hidden'); 
            }
        }
    });

    // Ses Slider Event Listener
    document.querySelectorAll('.remote-vol-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const targetId = e.target.getAttribute('data-id'); 
            const videoElem = document.querySelector(`#camera-${targetId} video`);
            if (videoElem) videoElem.volume = e.target.value / 100;
        });
    });

    // Mevcut Mute Butonu Event Listener
    document.querySelectorAll('.mute-remote-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.target.closest('.mute-remote-btn');
            const targetId = targetBtn.getAttribute('data-id'); 
            const videoElem = document.querySelector(`#camera-${targetId} video`);
            const slider = document.querySelector(`.remote-vol-slider[data-id="${targetId}"]`);
            if (locallyMutedUsers.has(targetId)) {
                locallyMutedUsers.delete(targetId); targetBtn.innerHTML = '<i class="fas fa-volume-up"></i>'; 
                targetBtn.classList.remove('muted');
                if (videoElem) videoElem.muted = false;
                if (slider) slider.value = 100;
            } else {
                locallyMutedUsers.add(targetId); targetBtn.innerHTML = '<i class="fas fa-volume-mute"></i>'; 
                targetBtn.classList.add('muted');
                if (videoElem) videoElem.muted = true;
                if (slider) slider.value = 0;
            }
        });
    });
    
    setTimeout(manageScreenshareView, 200);
});

socket.on('user-joined', (userId) => { peers[userId] = createPeerConnection(userId, true); });
socket.on('signal', async (userId, message) => {
    if (!peers[userId]) peers[userId] = createPeerConnection(userId, false);
    const pc = peers[userId];
    if (message.ice) pc.addIceCandidate(new RTCIceCandidate(message.ice));
    else if (message.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        if (message.sdp.type === 'offer') { const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); socket.emit('signal', userId, { sdp: pc.localDescription }); }
    }
});

function createPeerConnection(userId, isInitiator) {
    const pc = new RTCPeerConnection(configuration);
    if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = e => { if (e.candidate) socket.emit('signal', userId, { ice: e.candidate }); };
    pc.ontrack = e => addRemoteVideo(userId, e.streams[0]);
    if (isInitiator) { pc.createOffer().then(offer => { pc.setLocalDescription(offer); socket.emit('signal', userId, { sdp: offer }); }); }
    return pc;
}

function addRemoteVideo(userId, stream) {
    if (document.getElementById(`camera-${userId}`)) return;
    const isCamActive = currentUsers[userId] && currentUsers[userId].isCamOn;
    const box = document.createElement('div'); 
    box.className = isCamActive ? 'camera-box' : 'camera-box hidden'; 
    box.id = `camera-${userId}`;
    
    box.style.left = `${Math.random() * 50 + 170}px`; box.style.top = '10px';
    const vid = document.createElement('video'); vid.className = 'remote-video'; vid.autoplay = true; vid.playsInline = true; vid.srcObject = stream;
    if (locallyMutedUsers.has(userId)) vid.muted = true;
    box.appendChild(vid); cameraBoxesContainer.appendChild(box);
    setTimeout(manageScreenshareView, 100);
}

socket.on('user-left', (userId) => {
    if (peers[userId]) { peers[userId].close(); delete peers[userId]; }
    const box = document.getElementById(`camera-${userId}`); if (box) box.remove();
    locallyMutedUsers.delete(userId);
    manageScreenshareView();
});

// Not: Medya artık sayfa açılır açılmaz değil, odaya girerken isteniyor (bkz. join-form).

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

// --- DRAGGABLE CHAT BUBBLE ---
let isDraggingChat = false;
let dragStartX = 0;
let dragStartY = 0;
let currentRight = 20; 
let currentBottom = 75;

chatToggleBtn.addEventListener("mousedown", startDragChat);
chatToggleBtn.addEventListener("touchstart", startDragChat, {passive: false});

function startDragChat(e) {
    if (e.target.closest("#chat-toggle-btn") !== chatToggleBtn) return;
    isDraggingChat = true;
    dragHasMovedChat = false;
    dragStartX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    dragStartY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;
    
    const rect = chatToggleBtn.getBoundingClientRect();
    currentRight = window.innerWidth - rect.right;
    currentBottom = window.innerHeight - rect.bottom;
    chatToggleBtn.style.transition = 'none'; // REMOVE TRANSITION FOR SMOOTH DRAG
    
    document.addEventListener("mousemove", dragChat);
    document.addEventListener("touchmove", dragChat, {passive: false});
    document.addEventListener("mouseup", endDragChat);
    document.addEventListener("touchend", endDragChat);
}

function dragChat(e) {
    if (!isDraggingChat) return;
    const clientX = e.type.includes("mouse") ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes("mouse") ? e.clientY : e.touches[0].clientY;
    
    const deltaX = dragStartX - clientX;
    const deltaY = dragStartY - clientY;
    
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragHasMovedChat = true;
        if(e.cancelable) e.preventDefault();
    }
    
    dragStartX = clientX;
    dragStartY = clientY;
    
    currentRight += deltaX;
    currentBottom += deltaY;
    
    currentRight = Math.max(10, Math.min(window.innerWidth - 70, currentRight));
    currentBottom = Math.max(10, Math.min(window.innerHeight - 70, currentBottom));
    
    chatToggleBtn.style.right = `${currentRight}px`;
    chatToggleBtn.style.bottom = `${currentBottom}px`;
    
    chatPanel.style.bottom = `${currentBottom + 70}px`;
    if (currentRight > window.innerWidth / 2) {
        const leftPos = window.innerWidth - currentRight - 60;
        chatPanel.style.right = "auto";
        chatPanel.style.left = `${Math.max(10, leftPos)}px`;
    } else {
        chatPanel.style.left = "auto";
        chatPanel.style.right = `${currentRight}px`;
    }
}

function endDragChat() {
    isDraggingChat = false;
    chatToggleBtn.style.transition = '0.3s'; // RESTORE TRANSITION
    document.removeEventListener("mousemove", dragChat);
    document.removeEventListener("touchmove", dragChat);
    document.removeEventListener("mouseup", endDragChat);
    document.removeEventListener("touchend", endDragChat);
}


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
    if (isMicOn) {
        document.getElementById("toggle-mic-btn").click();
    }
});

socket.on("forceCamOff", () => {
    if (isCamOn) {
        document.getElementById("toggle-cam-btn").click();
    }
});

