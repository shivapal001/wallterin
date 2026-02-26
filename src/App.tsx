import React, { useState, useEffect, useRef } from 'react';

// --- Types ---
interface User {
  id: number;
  name: string;
  mobile: string;
  dep_balance: number;
  win_balance: number;
  bonus_balance: number;
}

interface Transaction {
  id: number;
  description: string;
  amount: number;
  type: number;
  timestamp: number;
}

interface GameHistory {
  id: number;
  period: number;
  color: string;
  num: number;
  timestamp: number;
}

interface BetHistory {
  id: number;
  period: number;
  color: string;
  num: number;
  bet_val: string;
  bet_type: string;
  amount: number;
  pnl: number;
  won: number;
}

const MODES = {
  '30sec': { dur: 30, name: 'WinGo 30sec' },
  '1min': { dur: 60, name: 'WinGo 1 Min' },
  '3min': { dur: 180, name: 'WinGo 3 Min' },
  '5min': { dur: 300, name: 'WinGo 5 Min' },
};

const NUM_BG: Record<number, string> = {
  0: 'linear-gradient(145deg,#f44336,#b71c1c)',
  1: 'linear-gradient(145deg,#4caf50,#1b5e20)',
  2: 'linear-gradient(145deg,#f44336,#b71c1c)',
  3: 'linear-gradient(145deg,#4caf50,#1b5e20)',
  4: 'linear-gradient(145deg,#f44336,#b71c1c)',
  5: 'linear-gradient(145deg,#9c27b0,#4a148c)',
  6: 'linear-gradient(145deg,#f44336,#b71c1c)',
  7: 'linear-gradient(145deg,#4caf50,#1b5e20)',
  8: 'linear-gradient(145deg,#f44336,#b71c1c)',
  9: 'linear-gradient(145deg,#4caf50,#1b5e20)',
};

const COLOR_HEX: Record<string, string> = { Green: '#43a047', Red: '#e53935', Violet: '#8e24aa', VioletRed: '#9c27b0', VioletGreen: '#7b1fa2' };
const COLOR_WHEEL = ['Green', 'Green', 'Green', 'Red', 'Red', 'Red', 'Violet'];
const NUM_WHEEL = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<'auth' | 'home' | 'profile' | 'wallet'>('auth');
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [mode, setMode] = useState<keyof typeof MODES>('30sec');
  const [timeLeft, setTimeLeft] = useState(30);
  const [period, setPeriod] = useState(0);
  const [selColor, setSelColor] = useState<string | null>(null);
  const [selNum, setSelNum] = useState<number | null>(null);
  const [betAmt, setBetAmt] = useState(10);
  const [betMult, setBetMult] = useState(1);
  const [betPlaced, setBetPlaced] = useState(false);
  const [locked, setLocked] = useState(false);
  const [gameHistory, setGameHistory] = useState<GameHistory[]>([]);
  const [myHistory, setMyHistory] = useState<BetHistory[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [histView, setHistView] = useState<'game' | 'my'>('game');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [overlay, setOverlay] = useState<{ show: boolean; color: string; num: number; won: boolean; pnl: number } | null>(null);

  // Modals
  const [depModal, setDepModal] = useState(false);
  const [wdModal, setWdModal] = useState(false);
  const [bindModal, setBindModal] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const sess = localStorage.getItem('tg_sess');
    if (sess) {
      const { k } = JSON.parse(sess);
      fetchUser(k);
    }
  }, []);

  useEffect(() => {
    if (user && screen === 'home') {
      startRound();
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user, screen, mode]);

  const fetchUser = async (mobile: string) => {
    try {
      const res = await fetch(`/api/user/${mobile}`);
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        setTransactions(data.tx);
        setMyHistory(data.bets);
        setScreen('home');
        fetchGameHistory();
      }
    } catch (e) {}
  };

  const fetchGameHistory = async () => {
    try {
      const res = await fetch('/api/game-history');
      const data = await res.json();
      if (data.success) setGameHistory(data.history);
    } catch (e) {}
  };

  const startRound = () => {
    const p = Math.floor(Date.now() / 1000) % 10000000;
    setPeriod(p);
    setTimeLeft(MODES[mode].dur);
    setBetPlaced(false);
    setLocked(false);
    setSelColor(null);
    setSelNum(null);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          resolveRound();
          return 0;
        }
        const lockAt = Math.min(5, Math.floor(MODES[mode].dur * 0.1));
        if (prev === lockAt + 1 && !betPlaced) {
          setLocked(true);
          showToast('⛔ Bets closed!', 'info');
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resolveRound = async () => {
    const rColor = COLOR_WHEEL[Math.floor(Math.random() * COLOR_WHEEL.length)];
    const rNum = NUM_WHEEL[Math.floor(Math.random() * NUM_WHEEL.length)];

    try {
      await fetch('/api/resolve-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, color: rColor, num: rNum }),
      });

      if (user) fetchUser(user.mobile);
      fetchGameHistory();

      // Check result for overlay
      let won = false;
      let pnl = 0;
      if (betPlaced && user) {
        // Local calculation for immediate feedback
        const betVal = selColor || selNum;
        const betType = selColor ? 'color' : 'num';
        if (betType === 'color') {
          if (betVal === rColor || (betVal === 'Violet' && (rColor === 'Violet' || rNum === 5 || rNum === 0))) {
            won = true;
          }
        } else {
          if (betVal === rNum) won = true;
        }
      }

      setOverlay({ show: true, color: rColor, num: rNum, won, pnl: 0 }); // pnl will be updated by fetchUser
    } catch (e) {}
  };

  const handleBet = async () => {
    if (locked || betPlaced) return;
    if (selColor === null && selNum === null) {
      showToast('⚠️ Select colour or number first!', 'info');
      return;
    }
    const totalAmt = betAmt * betMult;
    if (totalAmt < 10) {
      showToast('⚠️ Min bet is ₹10', 'info');
      return;
    }
    if (!user || totalAmt > (user.dep_balance + user.win_balance + user.bonus_balance)) {
      showToast('💰 Insufficient balance!', 'lose');
      return;
    }

    try {
      const res = await fetch('/api/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile: user.mobile,
          period,
          type: selColor ? 'color' : 'num',
          val: selColor || selNum,
          amount: totalAmt,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBetPlaced(true);
        fetchUser(user.mobile);
        showToast(`✅ ₹${totalAmt} on ${selColor || '#' + selNum}`, 'win');
      }
    } catch (e) {}
  };

  const showToast = (msg: string, type: string) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const doLogin = async (e: any) => {
    e.preventDefault();
    const mobile = e.target.mobile.value;
    const password = e.target.password.value;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, password: btoa(password) }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('tg_sess', JSON.stringify({ k: data.user.mobile }));
        setScreen('home');
      } else {
        showToast(data.message, 'lose');
      }
    } catch (e) {}
  };

  const doRegister = async (e: any) => {
    e.preventDefault();
    const name = e.target.name.value;
    const mobile = e.target.mobile.value;
    const password = e.target.password.value;
    const age = e.target.age.value;
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mobile, password: btoa(password), age }),
      });
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
        localStorage.setItem('tg_sess', JSON.stringify({ k: data.user.mobile }));
        setScreen('home');
      } else {
        showToast(data.message, 'lose');
      }
    } catch (e) {}
  };

  const doLogout = () => {
    setUser(null);
    localStorage.removeItem('tg_sess');
    setScreen('auth');
  };

  if (screen === 'auth') {
    return (
      <div id="auth-screen">
        <div className="auth-logo">
          <div className="auth-logo-circle"><span>💰</span></div>
          <div className="auth-logo-title">WALLTER</div>
          <div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.8rem', letterSpacing: '2px', marginTop: '4px' }}>WALLTER · PREDICT · WIN</div>
        </div>
        <div className="auth-box">
          <div className="auth-tabs">
            <button className={`auth-tab ${authTab === 'login' ? 'on' : ''}`} onClick={() => setAuthTab('login')}>Login</button>
            <button className={`auth-tab ${authTab === 'register' ? 'on' : ''}`} onClick={() => setAuthTab('register')}>Register</button>
          </div>
          {authTab === 'login' ? (
            <form onSubmit={doLogin}>
              <div className="auth-fg"><label>Mobile / Email</label><input name="mobile" type="text" placeholder="Enter mobile or email" required /></div>
              <div className="auth-fg"><label>Password</label><input name="password" type="password" placeholder="Password" required /></div>
              <button className="auth-submit" type="submit">LOGIN</button>
              <p className="auth-note">New user? <b onClick={() => setAuthTab('register')}>Register free</b></p>
            </form>
          ) : (
            <form onSubmit={doRegister}>
              <div className="auth-fg"><label>Full Name</label><input name="name" type="text" placeholder="Your name" required /></div>
              <div className="auth-fg"><label>Mobile Number</label><input name="mobile" type="tel" placeholder="10-digit mobile" required /></div>
              <div className="auth-fg"><label>Password</label><input name="password" type="password" placeholder="Min 6 chars" required /></div>
              <div className="auth-fg"><label>Age (18+)</label><input name="age" type="number" placeholder="Your age" required /></div>
              <button className="auth-submit" type="submit">CREATE ACCOUNT</button>
            </form>
          )}
        </div>
        {toast && <div className={`toast show ${toast.type}`}>{toast.msg}</div>}
      </div>
    );
  }

  const renderTimer = () => {
    const m = Math.floor(timeLeft / 60);
    const s = timeLeft % 60;
    const d = [Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10];
    return (
      <div className="timer-digits">
        <div className="td">{d[0]}</div>
        <div className="td">{d[1]}</div>
        <div className="td-sep">:</div>
        <div className="td">{d[2]}</div>
        <div className="td">{d[3]}</div>
      </div>
    );
  };

  return (
    <div className="app">
      {screen === 'home' && (
        <>
          <div className="topbar">
            <button className="tb-back" onClick={doLogout}>‹</button>
            <div className="tb-logo"><span>W</span>ALLTER</div>
            <div className="tb-icons">
              <button className="tb-icon" onClick={() => setScreen('wallet')}>👛</button>
              <button className="tb-icon">⏱</button>
            </div>
          </div>

          <div className="wallet-section">
            <div className="wallet-amt">₹{(user ? (user.dep_balance + user.win_balance + user.bonus_balance) : 0).toFixed(2)}</div>
            <div className="wallet-lbl"><span>👜</span> WALLET</div>
            <div className="wallet-btns">
              <button className="w-btn withdraw" onClick={() => setScreen('wallet')}>Withdraw</button>
              <button className="w-btn deposit" onClick={() => setScreen('wallet')}>Deposit</button>
            </div>
          </div>

          <div className="notice-bar">
            <span className="notice-icon">🔊</span>
            <span>Please be sure to always use our official website for playing the games...</span>
            <span className="notice-detail">Detail</span>
          </div>

          <div className="mode-tabs">
            {Object.keys(MODES).map((m) => (
              <div key={m} className={`m-tab ${mode === m ? 'active' : ''}`} onClick={() => setMode(m as any)}>
                <div className="m-tab-icon">⏱</div>
                <div className="m-tab-name">{(MODES as any)[m].name.replace('WinGo ', 'WinGo\n')}</div>
              </div>
            ))}
          </div>

          <div className="game-panel">
            <div className="gp-top">
              <div className="gp-howto">
                <span className="gp-howto-icon">📖</span>
                <span className="gp-howto-txt">How to play</span>
              </div>
              <div className="gp-info">
                <div className="gp-mode-name">{MODES[mode].name}</div>
                <div className="gp-balls-strip">
                  {gameHistory.slice(0, 8).map((h, i) => (
                    <div key={i} className="mini-ball" style={{ background: NUM_BG[h.num] }}>{h.num}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="gp-timer-section">
              <div>
                <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)' }}>Time remaining</div>
                {renderTimer()}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '.72rem', color: 'rgba(255,255,255,.5)', marginBottom: '4px' }}>Period ID</div>
                <div className="period-id-txt">20260221{String(period).padStart(9, '0')}</div>
              </div>
            </div>

            <div className="color-btns">
              <button className={`cb green ${selColor === 'Green' ? 'sel' : ''}`} onClick={() => { setSelColor('Green'); setSelNum(null); }}>Green</button>
              <button className={`cb violet ${selColor === 'Violet' ? 'sel' : ''}`} onClick={() => { setSelColor('Violet'); setSelNum(null); }}>Violet</button>
              <button className={`cb red ${selColor === 'Red' ? 'sel' : ''}`} onClick={() => { setSelColor('Red'); setSelNum(null); }}>Red</button>
            </div>

            <div className="balls-grid">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <div key={n} className={`ball b${n} ${selNum === n ? 'sel' : ''}`} onClick={() => { setSelNum(n); setSelColor(null); }}>
                  <div className="ball-inner" style={{ background: NUM_BG[n] }}>{n}</div>
                </div>
              ))}
            </div>

            <div className="sel-tag">
              {(selColor || selNum !== null) ? (
                <><span>Selected:</span><span className="sel-item">{selColor || `Number ${selNum}`}</span></>
              ) : (
                <span style={{ color: 'rgba(255,255,255,.4)' }}>Select colour or number to place bet</span>
              )}
            </div>

            <div className="bet-row">
              <div className="bet-x-btns">
                {[1, 5, 10, 20].map((x) => (
                  <button key={x} className={`bx ${betMult === x ? 'active' : ''}`} onClick={() => setBetMult(x)}>×{x}</button>
                ))}
              </div>
              <input className="bet-amt-inp" type="number" value={betAmt} onChange={(e) => setBetAmt(parseInt(e.target.value) || 0)} min="10" />
            </div>

            <div className="pot-row">
              <span className="pot-lbl">Potential Win</span>
              <span className="pot-val">₹{((betAmt * betMult) * (selColor ? (selColor === 'Violet' ? 4.5 : 2) : (selNum !== null ? 9 : 0))).toFixed(2)}</span>
            </div>

            <div style={{ padding: '0 14px 14px' }}>
              <button className="bet-place-btn" disabled={locked || betPlaced} onClick={handleBet}>
                {betPlaced ? '✅ Bet Placed!' : (locked ? 'Bets Closed' : 'Place Bet')}
              </button>
            </div>
          </div>

          <div className="hist-section">
            <div className="hist-tabs">
              <div className={`ht ${histView === 'game' ? 'on' : ''}`} onClick={() => setHistView('game')}>Game History</div>
              <div className={`ht ${histView === 'my' ? 'on' : ''}`} onClick={() => setHistView('my')}>My History</div>
            </div>
            <div id="histContent">
              {histView === 'game' ? (
                <>
                  <div className="hist-head"><div>Period</div><div style={{ textAlign: 'center' }}>Result</div><div style={{ textAlign: 'center' }}>Number</div><div style={{ textAlign: 'right' }}>Color</div></div>
                  {gameHistory.slice(0, 15).map((h, i) => (
                    <div key={i} className="hist-row">
                      <div className="h-period">{String(h.period).slice(-6)}</div>
                      <div style={{ textAlign: 'center' }}><div className="h-result-dot" style={{ background: NUM_BG[h.num] }}>{h.num}</div></div>
                      <div className="h-bet" style={{ color: 'rgba(255,255,255,.6)' }}>{h.num}</div>
                      <div style={{ textAlign: 'right', fontSize: '.78rem', fontWeight: 700, color: COLOR_HEX[h.color] }}>{h.color}</div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div className="hist-head"><div>Period</div><div style={{ textAlign: 'center' }}>Result</div><div style={{ textAlign: 'center' }}>Bet</div><div style={{ textAlign: 'right' }}>P&L</div></div>
                  {myHistory.slice(0, 15).map((h, i) => (
                    <div key={i} className="hist-row">
                      <div className="h-period">{String(h.period).slice(-6)}</div>
                      <div style={{ textAlign: 'center' }}><div className="h-result-dot" style={{ background: NUM_BG[h.num] }}>{h.num}</div></div>
                      <div className="h-bet" style={{ color: 'rgba(255,255,255,.6)', fontSize: '.75rem' }}>{h.bet_val}</div>
                      <div className={`h-pnl ${h.won ? 'w' : 'l'}`}>{h.won ? '+' : ''} ₹{Math.abs(h.pnl)}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {screen === 'profile' && user && (
        <div className="page">
          <div className="page-topbar">
            <button className="page-back" onClick={() => setScreen('home')}>‹</button>
            <div className="page-title">My Profile</div>
            <div style={{ width: '32px' }}></div>
          </div>
          <div className="page-scroll">
            <div className="prof-hero">
              <div className="prof-avatar">{user.name[0].toUpperCase()}</div>
              <div className="prof-name">{user.name}</div>
              <div className="prof-mobile">{user.mobile}</div>
              <div className="prof-badge">✅ Verified Member</div>
            </div>
            <div className="prof-bal-row">
              <div className="pbal-card"><div className="pbal-icon">💵</div><div className="pbal-val">₹{user.dep_balance.toFixed(2)}</div><div className="pbal-lbl">Deposit</div></div>
              <div className="pbal-card"><div className="pbal-icon">🏆</div><div className="pbal-val">₹{user.win_balance.toFixed(2)}</div><div className="pbal-lbl">Winnings</div></div>
              <div className="pbal-card"><div className="pbal-icon">🎁</div><div className="pbal-val">₹{user.bonus_balance.toFixed(2)}</div><div className="pbal-lbl">Bonus</div></div>
            </div>
            <div className="prof-total-card">
              <div className="ptc-left">
                <div className="ptc-lbl">Total Balance</div>
                <div className="ptc-val">₹{(user.dep_balance + user.win_balance + user.bonus_balance).toFixed(2)}</div>
              </div>
              <div className="ptc-right">
                <button className="ptc-btn pdep" onClick={() => setDepModal(true)}>+ Deposit</button>
                <button className="ptc-btn pwd" onClick={() => setWdModal(true)}>↑ Withdraw</button>
              </div>
            </div>
            <div className="prof-section-title">📋 Transaction History</div>
            <div className="prof-tx-card">
              {transactions.map((t, i) => (
                <div key={i} className="tx-row-item">
                  <div className={`tri-ico ${t.type === 1 ? 'pos' : 'neg'}`}>{t.type === 1 ? '💰' : '💸'}</div>
                  <div className="tri-info">
                    <div className="tri-desc">{t.description}</div>
                    <div className="tri-date">{new Date(t.timestamp).toLocaleString()}</div>
                  </div>
                  <div className={`tri-amt ${t.type === 1 ? 'pos' : 'neg'}`}>{t.type === 1 ? '+' : ''} ₹{Math.abs(t.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {screen === 'wallet' && user && (
        <div className="page">
          <div className="page-topbar">
            <button className="page-back" onClick={() => setScreen('home')}>‹</button>
            <div className="page-title">My Wallet</div>
            <div style={{ width: '32px' }}></div>
          </div>
          <div className="page-scroll">
            <div className="wal-hero">
              <div className="wh-lbl">Total Balance</div>
              <div className="wh-val">₹{(user.dep_balance + user.win_balance + user.bonus_balance).toFixed(2)}</div>
            </div>
            <div className="wal-action-row">
              <button className="war-btn dep" onClick={() => setDepModal(true)}>💳 Deposit</button>
              <button className="war-btn wd" onClick={() => setWdModal(true)}>🏦 Withdraw</button>
            </div>
            <div className="wal-sec-title">📋 All Transactions</div>
            <div className="wal-tx-wrap">
              {transactions.map((t, i) => (
                <div key={i} className="tx-row-item">
                  <div className={`tri-ico ${t.type === 1 ? 'pos' : 'neg'}`}>{t.type === 1 ? '💰' : '💸'}</div>
                  <div className="tri-info">
                    <div className="tri-desc">{t.description}</div>
                    <div className="tri-date">{new Date(t.timestamp).toLocaleString()}</div>
                  </div>
                  <div className={`tri-amt ${t.type === 1 ? 'pos' : 'neg'}`}>{t.type === 1 ? '+' : ''} ₹{Math.abs(t.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Overlays & Modals */}
      {overlay?.show && (
        <div className="overlay show">
          <div className="ov-card">
            <div className="ov-ball" style={{ background: NUM_BG[overlay.num] }}>{overlay.num}</div>
            <div className="ov-result-lbl">Result</div>
            <div className="ov-result-name" style={{ color: COLOR_HEX[overlay.color] }}>{overlay.color} · {overlay.num}</div>
            <div className={`ov-win-tag ${betPlaced ? (overlay.won ? 'win' : 'lose') : 'nobet'}`}>
              {!betPlaced ? 'No Bet' : (overlay.won ? '🎉 YOU WIN!' : '😔 BETTER LUCK')}
            </div>
            <button className="ov-close" onClick={() => setOverlay(null)}>Next Round →</button>
          </div>
        </div>
      )}

      {depModal && (
        <div className="modal-bg open" onClick={() => setDepModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="ms-handle"></div>
            <div className="ms-title">💳 Add Money</div>
            <div className="ms-label">Amount</div>
            <div className="ms-inp-row"><span className="ms-rupee">₹</span><input className="ms-inp" type="number" id="depAmt" placeholder="Min ₹100" /></div>
            <button className="ms-main-btn dep-btn" onClick={async () => {
              const amt = parseFloat((document.getElementById('depAmt') as HTMLInputElement).value);
              if (amt >= 100 && user) {
                await fetch('/api/wallet/deposit', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mobile: user.mobile, amount: amt, method: 'UPI' }),
                });
                fetchUser(user.mobile);
                setDepModal(false);
                showToast(`✅ ₹${amt} deposited!`, 'win');
              }
            }}>✅ Pay & Deposit</button>
          </div>
        </div>
      )}

      {wdModal && (
        <div className="modal-bg open" onClick={() => setWdModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="ms-handle"></div>
            <div className="ms-title">🏦 Withdraw Money</div>
            <div className="ms-label">Amount</div>
            <div className="ms-inp-row"><span className="ms-rupee">₹</span><input className="ms-inp" type="number" id="wdAmt" placeholder="Min ₹100" /></div>
            <button className="ms-main-btn wd-btn" onClick={async () => {
              const amt = parseFloat((document.getElementById('wdAmt') as HTMLInputElement).value);
              if (amt >= 100 && user && user.win_balance >= amt) {
                await fetch('/api/wallet/withdraw', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ mobile: user.mobile, amount: amt, method: 'Bank' }),
                });
                fetchUser(user.mobile);
                setWdModal(false);
                showToast(`✅ ₹${amt} withdrawal initiated!`, 'win');
              } else {
                showToast('Insufficient winnings!', 'lose');
              }
            }}>🏦 Withdraw Now</button>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      {screen !== 'auth' && (
        <div className="bottom-nav">
          <div className={`bn-item ${screen === 'home' ? 'active' : ''}`} onClick={() => setScreen('home')}>
            <div className="bn-icon">🏠</div><div className="bn-lbl">Home</div>
          </div>
          <div className={`bn-item ${screen === 'wallet' ? 'active' : ''}`} onClick={() => setScreen('wallet')}>
            <div className="bn-icon">💰</div><div className="bn-lbl">Wallet</div>
          </div>
          <div className={`bn-item ${screen === 'profile' ? 'active' : ''}`} onClick={() => setScreen('profile')}>
            <div className="bn-icon">👤</div><div className="bn-lbl">Profile</div>
          </div>
        </div>
      )}

      {toast && <div className={`toast show ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
