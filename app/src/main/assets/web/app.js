const PACKET_TYPE = "bluethread.message";
const ENCRYPTED_PACKET_TYPE = "bluethread.message.encrypted";
const ENCRYPTED_VERSION = 3;
const PBKDF2_ITERATIONS = 120000;
const STORAGE_KEY = "bluethread.profile";
const CRYPTO_CACHE_KEY = "bluethread.crypto.cache";
const MAX_MESSAGE_LENGTH = 500;

const state = {
  connected: false,
  demoTimer: null,
  deferredInstallPrompt: null,
  userTag: "",
  peer: { username: "Bluetooth peer", tag: "@remote" },
  encoder: new TextEncoder(),
  decoder: new TextDecoder(),
  receivedIds: new Set(),
  derivedKey: null,
  derivedKeyFingerprint: "",
  reconnectTimer: null,
  reconnectAttempt: 0,
  manuallyDisconnected: false,
};

const els = {};
document.querySelectorAll("[id]").forEach(n => els[n.id] = n);

function setMobileSettings(open) {
  if (!els.sidebar || !els.mobileOverlay) return;
  els.sidebar.classList.toggle("mobile-open", open);
  els.mobileOverlay.hidden = !open;
  document.body.classList.toggle("settings-open", open);
  if (open) els.closeSettingsBtn?.focus();
}
function nowTime() {
  return new Intl.DateTimeFormat([], {hour:"2-digit", minute:"2-digit", second:"2-digit"}).format(new Date());
}
function sanitizeUsername(v) {
  const x=(v||"").trim().replace(/\s+/g," ");
  return x || "You";
}
function initialsFor(name) {
  const p=sanitizeUsername(name).split(" ");
  return `${p[0]?.[0]||"Y"}${p.length>1?p[p.length-1][0]:(p[0]?.[1]||"")}`.toUpperCase();
}
function colorFor(value) {
  const colors=["#2563eb","#087b74","#e45f43","#7c3aed","#be3b72","#2f7d32"];
  return colors[[...(value||"")].reduce((s,c)=>s+c.charCodeAt(0),0)%colors.length];
}
function setAvatar(node,name,tag="") {
  if(!node) return;
  node.textContent=initialsFor(name);
  node.style.background=colorFor(name+tag);
}
function createTag() {
  const n=crypto.getRandomValues(new Uint8Array(2));
  return "@"+(((n[0]<<8)+n[1]).toString().padStart(5,"0").slice(0,5));
}
function loadProfile() {
  try {
    const p=JSON.parse(localStorage.getItem(STORAGE_KEY)||"{}");
    state.userTag=p.tag||createTag();
    els.usernameInput.value=p.username||"You";
  } catch {
    state.userTag=createTag(); els.usernameInput.value="You";
  }
}
function saveProfile() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify({username:sanitizeUsername(els.usernameInput.value),tag:state.userTag})); } catch {}
}
function renderProfile() {
  const n=sanitizeUsername(els.usernameInput.value);
  els.userTag.textContent=state.userTag;
  els.memberSelfName.textContent=n;
  els.memberSelfTag.textContent=`${state.userTag} - You`;
  els.welcomeText.textContent=`Ready as ${n}.`;
  setAvatar(els.profileAvatar,n,state.userTag);
  setAvatar(els.composerAvatar,n,state.userTag);
  setAvatar(els.memberSelfAvatar,n,state.userTag);
  saveProfile();
}
function addLog(title,detail="") {
  const li=document.createElement("li");
  const a=document.createElement("strong"), b=document.createElement("span");
  a.textContent=title; b.textContent=detail||nowTime();
  li.append(a,b); els.activityLog.prepend(li);
}
function clearWelcomeState(){els.messages.querySelector(".welcome-state")?.remove();}
function addMessage(kind,text,author={}) {
  clearWelcomeState();
  const username=author.username||(kind==="sent"?sanitizeUsername(els.usernameInput.value):"BlueThread");
  const tag=author.tag||(kind==="sent"?state.userTag:"@system");
  const message=document.createElement("article");
  const avatar=document.createElement("div"), body=document.createElement("div"), heading=document.createElement("div");
  const name=document.createElement("strong"), tagNode=document.createElement("span"), time=document.createElement("time"), textNode=document.createElement("div");
  message.className=`message ${kind}`; avatar.className="avatar avatar-small"; body.className="message-body";
  heading.className="message-heading"; textNode.className="message-text";
  setAvatar(avatar,username,tag); name.textContent=username; tagNode.textContent=tag; time.textContent=nowTime(); textNode.textContent=text;
  heading.append(name,tagNode,time); body.append(heading,textNode); message.append(avatar,body); els.messages.append(message);
  requestAnimationFrame(()=>{els.messages.scrollTop=els.messages.scrollHeight;});
}
function updatePeer(peer) {
  state.peer={username:peer.username||"Bluetooth peer",tag:peer.tag||"@remote"};
  els.peerMember.hidden=false; els.memberCount.textContent="2";
  els.peerName.textContent=state.peer.username; els.peerTag.textContent=state.peer.tag;
  setAvatar(els.peerAvatar,state.peer.username,state.peer.tag);
}
function hidePeer(){els.peerMember.hidden=true; els.memberCount.textContent="1";}
function setStatus(label,mode="idle") {
  els.statusBadge.textContent=label; els.statusBadge.className=`status-badge ${mode}`;
}
function setConnected(yes) {
  state.connected=yes;
  els.connectBtn.disabled=yes;
  els.disconnectBtn.disabled=!yes;
  els.sendBtn.disabled=!yes;
  els.connectionMeta.textContent=yes?"Bluetooth connection active":"Ready for a Bluetooth connection";
  setStatus(yes?"Connected":"Idle",yes?"connected":"idle");
  if (yes) {
    state.reconnectAttempt=0;
    state.manuallyDisconnected=false;
    if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer=null; }
  }
}
function supportsNative() { return !!window.BlueThreadAndroid; }

async function connect() {
  state.manuallyDisconnected=false;
  if(!supportsNative()) {
    alert("Open this app as the Android APK. The browser version cannot do phone-to-phone Bluetooth.");
    return;
  }
  try {
    setStatus("Connecting…","connecting");
    await window.BlueThreadAndroid.connect();
  } catch(e) {
    setStatus("Idle","idle");
    addLog("Connection failed",String(e));
  }
}
function disconnect() {
  state.manuallyDisconnected=true;
  if (state.reconnectTimer) { clearTimeout(state.reconnectTimer); state.reconnectTimer=null; }
  if(supportsNative()) window.BlueThreadAndroid.disconnect();
}
function scheduleReconnect() {
  if (!supportsNative() || state.manuallyDisconnected || state.connected || state.reconnectAttempt >= 5) return;
  if (state.reconnectTimer) return;
  const delay=Math.min(5000, 500 * (2 ** state.reconnectAttempt));
  state.reconnectAttempt++;
  setStatus(`Reconnecting ${state.reconnectAttempt}/5…`,"connecting");
  state.reconnectTimer=setTimeout(()=>{
    state.reconnectTimer=null;
    try { window.BlueThreadAndroid.reconnect(); } catch {}
  },delay);
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function createMessageId() {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
}
function buildAad(packet) {
  return state.encoder.encode([packet.type, packet.version, packet.messageId, packet.sentAt, packet.username, packet.tag].join("|"));
}
function rememberMessageId(id) {
  if (!id || state.receivedIds.has(id)) return false;
  state.receivedIds.add(id);
  if (state.receivedIds.size > 2000) state.receivedIds.delete(state.receivedIds.values().next().value);
  return true;
}
async function getRoomKey(roomKey) {
  const raw=(roomKey||"").trim();
  if (raw.length < 8) throw new Error("Use a room key of at least 8 characters.");
  const fingerprint=bytesToBase64((await sha256(state.encoder.encode("BlueThread|"+raw))).slice(0,12));
  if (state.derivedKey && state.derivedKeyFingerprint===fingerprint) return state.derivedKey;
  const salt=await sha256(state.encoder.encode("BlueThread room salt|"+raw));
  const material=await crypto.subtle.importKey("raw",state.encoder.encode(raw),"PBKDF2",false,["deriveKey"]);
  state.derivedKey=await crypto.subtle.deriveKey(
    {name:"PBKDF2",salt:salt.slice(0,16),iterations:PBKDF2_ITERATIONS,hash:"SHA-256"},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]
  );
  state.derivedKeyFingerprint=fingerprint;
  return state.derivedKey;
}
function invalidateCryptoCache(){state.derivedKey=null;state.derivedKeyFingerprint="";}

async function encryptPacket(text) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const username=sanitizeUsername(els.usernameInput.value), tag=state.userTag;
  const sentAt=Date.now(), messageId=createMessageId();
  const key=await getRoomKey(els.roomKeyInput.value);
  const packet={type:ENCRYPTED_PACKET_TYPE,version:ENCRYPTED_VERSION,username,tag,sentAt,messageId};
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:buildAad(packet)},key,state.encoder.encode(text));
  return {...packet,iv:bytesToBase64(iv),ciphertext:bytesToBase64(new Uint8Array(ciphertext))};
}
async function decryptPacket(packet) {
  if(!packet?.iv||!packet?.ciphertext||packet.version!==ENCRYPTED_VERSION||!packet.messageId||!Number.isFinite(packet.sentAt)) throw new Error("Invalid encrypted packet.");
  const iv=base64ToBytes(packet.iv), ciphertext=base64ToBytes(packet.ciphertext);
  if(iv.length!==12||ciphertext.length<16) throw new Error("Invalid encrypted packet parameters.");
  if(Math.abs(Date.now()-packet.sentAt)>24*60*60*1000) throw new Error("Stale message.");
  const key=await getRoomKey(els.roomKeyInput.value);
  const plaintext=await crypto.subtle.decrypt({name:"AES-GCM",iv,additionalData:buildAad(packet)},key,ciphertext);
  return state.decoder.decode(plaintext);
}

async function sendNative(text) {
  if(!supportsNative()) throw new Error("Native Bluetooth is unavailable.");
  const username=sanitizeUsername(els.usernameInput.value);
  const packet=els.encryptionEnabled.checked
    ? await encryptPacket(text)
    : {type:PACKET_TYPE,version:1,username,tag:state.userTag,text,sentAt:Date.now(),messageId:createMessageId()};
  window.BlueThreadAndroid.send(JSON.stringify(packet));
}

els.connectBtn.onclick=connect;
els.disconnectBtn.onclick=disconnect;
els.usernameInput.addEventListener("input",renderProfile);
els.roomKeyInput.addEventListener("input",invalidateCryptoCache);
els.toggleKeyBtn.onclick=()=>{const p=els.roomKeyInput;p.type=p.type==="password"?"text":"password";els.toggleKeyBtn.textContent=p.type==="password"?"Show":"Hide";};
els.encryptionEnabled.onchange=()=>{els.cryptoBadge.textContent=els.encryptionEnabled.checked?"On":"Off";els.cryptoBadge.className=`status-badge ${els.encryptionEnabled.checked?"connected":"off"}`;};

els.messageForm.onsubmit=async e=>{
  e.preventDefault();
  const text=els.messageInput.value.trim();
  if(!text||!state.connected) return;
  const button=els.sendBtn;
  button.disabled=true;
  try {
    await sendNative(text);
    addMessage("sent",text);
    els.messageInput.value="";
    els.messageInput.style.height="";
    if (navigator.vibrate) navigator.vibrate(8);
  } catch(e) { addLog("Send failed",String(e)); }
  finally { button.disabled=!state.connected; els.messageInput.focus(); }
};

els.messageInput.addEventListener("input",()=>{
  els.messageInput.style.height="auto";
  els.messageInput.style.height=Math.min(140,Math.max(48,els.messageInput.scrollHeight))+"px";
});
els.messageInput.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.shiftKey&&window.innerWidth>520){e.preventDefault();els.messageForm.requestSubmit();}
});

els.demoBtn.onclick=()=>{
  if(state.demoTimer){clearInterval(state.demoTimer);state.demoTimer=null;els.demoBtn.textContent="Demo chat";return;}
  state.demoTimer=setInterval(()=>{
    const replies=["Message received.","Signal looks steady.","Ready for the next one.","I can hear you."];
    addMessage("received",replies[Math.floor(Math.random()*replies.length)],{username:"Demo peer",tag:"@demo"});
  },1200);
  els.demoBtn.textContent="Stop demo";
};
els.clearLogBtn.onclick=()=>els.activityLog.replaceChildren();

window.BlueThreadWeb={
  onConnected:deviceName=>{setConnected(true);updatePeer({username:deviceName||"Bluetooth peer",tag:"@remote"});addLog("Connected",deviceName||"Bluetooth peer");},
  onDisconnected:()=>{setConnected(false);hidePeer();addLog("Disconnected");scheduleReconnect();},
  onMessage:async raw=>{
    try {
      const p=JSON.parse(raw);
      if(p.type===ENCRYPTED_PACKET_TYPE){
        if(p.messageId&&state.receivedIds.has(p.messageId))return;
        try{const text=await decryptPacket(p);if(!rememberMessageId(p.messageId))return;addMessage("received",text,{username:p.username||"Bluetooth peer",tag:p.tag||"@remote"});updatePeer({username:p.username,tag:p.tag});}
        catch(e){addLog("Decrypt failed","Wrong room key or damaged message");}
      } else if(p.type===PACKET_TYPE&&p.text){if(p.messageId&&!rememberMessageId(p.messageId))return;addMessage("received",p.text,{username:p.username||"Bluetooth peer",tag:p.tag||"@remote"});updatePeer({username:p.username,tag:p.tag});}
      else addMessage("received",raw);
    } catch { addMessage("received",raw); }
  },
  onError:msg=>{addLog("Bluetooth error",msg);scheduleReconnect();}
};

els.settingsBtn?.addEventListener("click",()=>setMobileSettings(true));
els.closeSettingsBtn?.addEventListener("click",()=>setMobileSettings(false));
els.mobileOverlay?.addEventListener("click",()=>setMobileSettings(false));
document.addEventListener("keydown",e=>{if(e.key==="Escape")setMobileSettings(false);});

loadProfile();renderProfile();
els.supportText.textContent=supportsNative()?"Native Bluetooth chat":"Web preview";
els.installHelp.textContent=supportsNative()?"Installed Android app.":"Use the Android APK for phone-to-phone Bluetooth.";
setConnected(false);
