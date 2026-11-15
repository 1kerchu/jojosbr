import Peer from 'peerjs';

// Red P2P con PeerJS. Topología en estrella: el anfitrión reenvía todo a los demás.
const PREFIX = 'sbr-bizarre-race-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// ?peer=host:puerto permite usar un servidor PeerJS propio (por defecto, el público de peerjs.com)
function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 1 };
  const [host, port] = q.split(':');
  return { debug: 1, host, port: +port || 9000, path: '/', secure: location.protocol === 'https:' && host !== 'localhost' };
}
export const makeCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.conns = new Map(); // id -> DataConnection (en el host: todos los clientes; en cliente: solo el host)
    this.handlers = {};
    this.myId = null;
    this.code = null;
    this.offline = false;
  }
  on(type, fn) { this.handlers[type] = fn; }
  emitLocal(msg, from) { const h = this.handlers[msg.t]; if (h) h(msg, from); }

  // Modo sin conexión (contra bots)
  startOffline() {
    this.offline = true; this.isHost = true; this.myId = 'local-' + Math.random().toString(36).slice(2, 8);
    return Promise.resolve(this.myId);
  }

  host() {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.code = makeCode();
      this.peer = new Peer(PREFIX + this.code, peerOptions());
      this.peer.on('open', id => { this.myId = id; resolve(this.code); });
      this.peer.on('error', err => {
        if (err.type === 'unavailable-id') { this.peer.destroy(); this.host().then(resolve, reject); return; }
        console.warn(err); this.emitLocal({ t: 'neterror', err: String(err.type || err) });
        reject(err);
      });
      this.peer.on('connection', conn => {
        conn.on('open', () => { this.conns.set(conn.peer, conn); });
        conn.on('data', data => this.emitLocal(data, conn.peer));
        conn.on('close', () => { this.conns.delete(conn.peer); this.emitLocal({ t: 'leave', id: conn.peer }, conn.peer); });
        conn.on('error', () => { this.conns.delete(conn.peer); this.emitLocal({ t: 'leave', id: conn.peer }, conn.peer); });
      });
      this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { } });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.code = code.toUpperCase().trim();
      this.peer = new Peer(peerOptions());
      let done = false;
      const fail = (e) => { if (!done) { done = true; reject(e); } };
      setTimeout(() => fail(new Error('timeout')), 15000);
      this.peer.on('open', id => {
        this.myId = id;
        const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
        conn.on('open', () => { this.conns.set('host', conn); this.hostConn = conn; done = true; resolve(id); });
        conn.on('data', data => this.emitLocal(data, 'host'));
        conn.on('close', () => this.emitLocal({ t: 'hostlost' }));
        conn.on('error', fail);
      });
      this.peer.on('error', err => { console.warn(err); if (!done) fail(err); else this.emitLocal({ t: 'neterror', err: String(err.type || err) }); });
    });
  }

  // envía un mensaje a todos (el host lo difunde; un cliente lo manda al host, que lo reenvía)
  broadcast(msg, exceptId) {
    if (this.offline) return;
    if (this.isHost) {
      for (const [id, c] of this.conns) if (id !== exceptId && c.open) { try { c.send(msg); } catch (e) { } }
    } else if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(msg); } catch (e) { }
    }
  }
  sendTo(id, msg) { const c = this.conns.get(id); if (c && c.open) try { c.send(msg); } catch (e) { } }

  close() { try { this.peer && this.peer.destroy(); } catch (e) { } this.conns.clear(); }
}
